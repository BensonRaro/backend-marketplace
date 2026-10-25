// Job service — business logic + DB for job postings (client-only create)
import { prisma } from "../lib/prisma.js";
import { summariesForIds } from "./review.service.js";
import type { CreateJobInput } from "../validators/job.validator.js";

function apiError(msg: string, status: number, code: string) {
  const e = new Error(msg) as Error & { status?: number; code?: string };
  e.status = status;
  e.code = code;
  return e;
}

// Query dollars → stored cents (null when missing/invalid/negative)
function toCents(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export async function createJobService(userId: string, role: string, input: CreateJobInput) {
  if (role !== "client" && role !== "admin") throw apiError("Only clients can create jobs", 403, "FORBIDDEN");
  // Client must hold a verified payment card to fund escrow (Connect is freelancer-only)
  if (role !== "admin") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripePaymentVerified: true } });
    if (!user?.stripePaymentVerified) throw apiError("Verify a payment card to post jobs — visit /verify-stripe", 403, "VERIFICATION_REQUIRED");
  }

  let categoryId: string | null = null;
  if (input.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw apiError("Category not found", 400, "INVALID_CATEGORY");
    categoryId = cat.id;
  }

  const job = await prisma.jobPosting.create({
    data: {
      title: input.title.trim(),
      description: input.description.trim(),
      budgetType: input.budgetType,
      budget: Math.round(input.budget * 100),
      skills: input.skills,
      categoryId,
      clientId: userId,
      // Upfront milestones (unfunded) — dollars in, cents stored
      milestones: input.milestones?.length
        ? { create: input.milestones.map((ms) => ({ title: ms.title.trim(), description: ms.description?.trim() || null, amount: Math.round(ms.amount * 100) })) }
        : undefined,
    },
    include: { category: true, milestones: true, client: { select: { id: true, name: true, image: true } } },
  });
  return job;
}

export async function listJobsService(query: { category?: string; skill?: string; search?: string; budgetType?: string; minBudget?: number; maxBudget?: number; page?: number; limit?: number }) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 6));
  const skip = (page - 1) * limit;

  // Public browse — open + funded only (unfunded work stays invisible until escrow locks)
  const funded: Record<string, unknown> = { OR: [{ escrowStatus: "funded" }, { milestones: { some: { status: "funded" } } }] };
  // Jobs posted by suspended clients disappear from public browse
  const where: Record<string, unknown> = { isOpen: true, client: { is: { isBanned: false } }, AND: [funded] };
  if (query.category?.trim() && /^[a-f\d]{24}$/i.test(query.category.trim())) (where as Record<string, unknown>).categoryId = query.category.trim();
  if (query.skill?.trim()) (where as Record<string, unknown>).skills = { has: query.skill.trim() };
  if (query.budgetType?.trim()) (where as Record<string, unknown>).budgetType = query.budgetType.trim();
  // Price range — dollars in, cents compared (invalid/negative bounds ignored)
  const minCents = toCents(query.minBudget);
  const maxCents = toCents(query.maxBudget);
  if (minCents != null || maxCents != null) {
    (where as Record<string, unknown>).budget = { ...(minCents != null ? { gte: minCents } : {}), ...(maxCents != null ? { lte: maxCents } : {}) };
  }
  if (query.search?.trim()) {
    const s = query.search.trim();
    ((where as Record<string, unknown>).AND as unknown[]).push({
      OR: [
        { title: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  const [jobs, total] = await Promise.all([
    prisma.jobPosting.findMany({
      where: where as never,
      include: { category: true, client: { select: { id: true, name: true, image: true } }, _count: { select: { proposals: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.jobPosting.count({ where: where as never }),
  ]);
  // Poster reputation for job cards — one grouped query across the page
  const ratings = await summariesForIds(jobs.map((j) => j.clientId));
  const data = jobs.map((j) => ({ ...j, clientRating: ratings[j.clientId] ?? { average: null, count: 0 } }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function listClientJobsService(clientId: string, query: { search?: string; category?: string; skill?: string; budgetType?: string; page?: number; limit?: number }) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(query.limit) || 6));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { clientId };
  if (query.category?.trim() && /^[a-f\d]{24}$/i.test(query.category.trim())) (where as Record<string, unknown>).categoryId = query.category.trim();
  if (query.skill?.trim()) (where as Record<string, unknown>).skills = { has: query.skill.trim() };
  if (query.budgetType?.trim()) (where as Record<string, unknown>).budgetType = query.budgetType.trim();
  if (query.search?.trim()) {
    const s = query.search.trim();
    (where as Record<string, unknown>).OR = [
      { title: { contains: s, mode: "insensitive" } },
      { description: { contains: s, mode: "insensitive" } },
    ];
  }

  const [jobs, total] = await Promise.all([
    prisma.jobPosting.findMany({
      where: where as never,
      include: { category: true, milestones: { select: { id: true, title: true, amount: true, status: true }, orderBy: { createdAt: "asc" } }, _count: { select: { proposals: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.jobPosting.count({ where: where as never }),
  ]);
  return { data: jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// Public detail — proposals + unfunded milestones are owner-only (bids and draft escrow stay private)
export async function getJobService(id: string, requester?: { id: string; role: string }) {
  const job = await prisma.jobPosting.findUnique({
    where: { id },
    include: { category: true, client: { select: { id: true, name: true, image: true, isBanned: true } }, contract: { select: { id: true } }, _count: { select: { proposals: true } } },
  });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  const isOwner = !!requester && (job.clientId === requester.id || requester.role === "admin");
  // A suspended client's postings are hidden from everyone but the owner/admin
  if (job.client.isBanned && !isOwner) throw apiError("Job not found", 404, "NOT_FOUND");
  const [milestones, proposals] = await Promise.all([
    prisma.milestone.findMany({
      where: isOwner ? { jobId: id } : { jobId: id, status: "funded" },
      select: { id: true, title: true, description: true, amount: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    isOwner
      ? prisma.proposal.findMany({ where: { jobId: id, freelancer: { is: { isBanned: false } } }, include: { freelancer: { select: { id: true, name: true, image: true, freelancerProfile: { select: { title: true, bio: true, skills: true, hourlyRate: true, location: true, website: true } } } } }, orderBy: { createdAt: "desc" } })
      : [],
  ]);
  // Bidder reputation for the owner reviewing bids — one grouped query
  const ratings = await summariesForIds(proposals.map((p) => p.freelancerId));
  const withRatings = proposals.map((p) => ({ ...p, freelancerRating: ratings[p.freelancerId] ?? { average: null, count: 0 } }));
  return { ...job, milestones, proposals: withRatings };
}

export async function updateJobService(userId: string, role: string, jobId: string, input: import("../validators/job.validator.js").UpdateJobInput) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (job.clientId !== userId && role !== "admin") throw apiError("Only the owner can edit this job", 403, "FORBIDDEN");
  // Optional: prevent editing if already has a contract/closed for editing? Allow for now
  // if (job.contract) throw apiError("Cannot edit contracted job", 400, "INVALID_STATE");

  let categoryId: string | null | undefined = undefined;
  if (input.categoryId !== undefined) {
    if (!input.categoryId) categoryId = null;
    else {
      const cat = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!cat) throw apiError("Category not found", 400, "INVALID_CATEGORY");
      categoryId = cat.id;
    }
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.budgetType !== undefined) data.budgetType = input.budgetType;
  if (input.budget !== undefined) data.budget = Math.round(input.budget * 100);
  if (input.skills !== undefined) data.skills = input.skills;
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (input.isOpen !== undefined) data.isOpen = input.isOpen;

  const updated = await prisma.jobPosting.update({
    where: { id: jobId },
    data: data as never,
    include: { category: true, client: { select: { id: true, name: true, image: true } } },
  });
  return updated;
}

export async function deleteJobService(userId: string, role: string, jobId: string) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, include: { proposals: { select: { id: true } }, contract: { select: { id: true } } } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (job.clientId !== userId && role !== "admin") throw apiError("Only the owner can delete this job", 403, "FORBIDDEN");
  if (job.contract) throw apiError("Cannot delete job with active contract", 400, "HAS_CONTRACT");
  // Funded escrow must never be orphaned — release/refund path owns it from here
  const escrowed = await prisma.milestone.count({ where: { jobId, status: { not: "unfunded" } } });
  if (job.escrowStatus === "funded" || escrowed > 0) throw apiError("Cannot delete job with funded escrow", 400, "FUNDED_ESCROW");
  // Proposals will cascade delete via onDelete: Cascade
  await prisma.jobPosting.delete({ where: { id: jobId } });
  return { id: jobId };
}
