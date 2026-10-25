// Loads the job + bid context the AI ranks — no prompting here, just one safe snapshot
import { prisma } from "../lib/prisma.js";
import { summariesForIds } from "./review.service.js";

// Prompt-size cap: only the newest bids are ranked (keeps free-tier models inside context)
export const MAX_RECOMMENDATIONS = 12;
const MAX_LETTER = 700; // cover letter chars shown to the model
const MAX_BIO = 400;

export type ScoredProposal = {
  proposalId: string;
  score: number;
  summary: string;
  strengths: string[];
  concerns: string[];
};

export type RecommendationContext = {
  jobId: string;
  job: {
    title: string;
    description: string;
    budgetType: string;
    budget: number; // cents
    skills: string[];
    category: string | null;
  };
  proposals: {
    id: string;
    bidAmount: number; // cents
    duration: number | null;
    coverLetter: string;
    name: string;
    title: string | null;
    bio: string | null;
    skills: string[];
    hourlyRate: number | null; // cents
    location: string | null;
    rating: { average: number | null; count: number };
  }[];
};

// Snapshot for one job — null when the job is gone or has no (visible) bids to rank
export async function loadRecommendationContext(jobId: string): Promise<RecommendationContext | null> {
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: {
      title: true,
      description: true,
      budgetType: true,
      budget: true,
      skills: true,
      category: { select: { name: true } },
    },
  });
  if (!job) return null;
  const rows = await prisma.proposal.findMany({
    // Suspended bidders are never recommended
    where: { jobId, freelancer: { is: { isBanned: false } } },
    include: {
      freelancer: {
        select: {
          name: true,
          freelancerProfile: { select: { title: true, bio: true, skills: true, hourlyRate: true, location: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RECOMMENDATIONS,
  });
  if (!rows.length) return null;

  const ratings = await summariesForIds(rows.map((r) => r.freelancerId));
  return {
    jobId,
    job: {
      title: job.title,
      description: job.description.slice(0, 1800),
      budgetType: job.budgetType,
      budget: job.budget,
      skills: job.skills,
      category: job.category?.name ?? null,
    },
    proposals: rows.map((r) => {
      const p = r.freelancer.freelancerProfile;
      return {
        id: r.id,
        bidAmount: r.bidAmount,
        duration: r.duration,
        coverLetter: r.coverLetter.slice(0, MAX_LETTER),
        name: r.freelancer.name ?? "Freelancer",
        title: p?.title ?? null,
        bio: p?.bio ? p.bio.slice(0, MAX_BIO) : null,
        skills: p?.skills ?? [],
        hourlyRate: p?.hourlyRate ?? null,
        location: p?.location ?? null,
        rating: ratings[r.freelancerId] ?? { average: null, count: 0 },
      };    }),
  };
}

