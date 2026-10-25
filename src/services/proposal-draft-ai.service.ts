// Draft generation — loads the job/profile snapshot, calls the model chain, stores the letter
import { prisma } from "../lib/prisma.js";
import { chatJsonWithModel } from "../lib/openrouter.js";
import { draftReplySchema } from "../validators/proposal-draft.validator.js";
import { summariesForIds } from "./review.service.js";
import { assertDraftable } from "./proposal-draft.service.js";
import { buildDraftMessages, cleanDraft, type DraftContext } from "./proposal-draft.prompt.js";

const MAX_DESCRIPTION = 1600; // keeps the free model's prompt inside its comfort zone
const MAX_BIO = 700;
const MAX_TOKENS = 900; // ~250 words of letter; the client lib raises this for reasoning models

// Injectable so the DB path can be exercised without spending model tokens
type ModelCall = (messages: ReturnType<typeof buildDraftMessages>, maxTokens?: number) => Promise<{ data: unknown; model: string }>;

// Everything the model may know — no client identity, no other bids, dollars not cents
export async function loadDraftContext(userId: string, jobId: string): Promise<DraftContext> {
  // Gates are re-checked here: a job can close or the freelancer can bid while the run is queued
  await assertDraftable(userId, jobId);

  const [job, user] = await Promise.all([
    prisma.jobPosting.findUnique({
      where: { id: jobId },
      include: { category: { select: { name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        freelancerProfile: { select: { title: true, bio: true, skills: true, hourlyRate: true, location: true } },
      },
    }),
  ]);
  if (!job || !user) throw new Error("Job or freelancer disappeared before the draft ran");

  const profile = user.freelancerProfile;
  const ratings = await summariesForIds([userId]);

  return {
    job: {
      title: job.title,
      description: job.description.slice(0, MAX_DESCRIPTION),
      budgetType: job.budgetType,
      budget: Math.round(job.budget / 100),
      skills: job.skills,
      category: job.category?.name ?? null,
    },
    freelancer: {
      name: user.name,
      title: profile?.title ?? null,
      bio: profile?.bio ? profile.bio.slice(0, MAX_BIO) : null,
      skills: profile?.skills ?? [],
      hourlyRate: profile?.hourlyRate ? Math.round(profile.hourlyRate / 100) : null,
      location: profile?.location ?? null,
      rating: ratings[userId] ?? { average: null, count: 0 },
    },
  };
}

// One durable attempt: build → call the chain → clean → mark the row ready
export async function generateDraft(draftId: string, userId: string, jobId: string, call: ModelCall = chatJsonWithModel) {
  const ctx = await loadDraftContext(userId, jobId);
  const { data, model } = await call(buildDraftMessages(ctx), MAX_TOKENS);
  const reply = draftReplySchema.parse(data);
  const coverLetter = cleanDraft(reply.coverLetter);

  await prisma.proposalDraft.update({
    where: { id: draftId },
    data: { status: "ready", coverLetter, model, error: null, errorCode: null },
  });
  return { draftId, model, chars: coverLetter.length };
}

// Final state when every retry is exhausted — the form stops polling and offers a retry
export async function markDraftFailed(draftId: string, err: unknown) {
  const e = err as { code?: string; message?: string };
  const data = {
    status: "failed" as const,
    errorCode: e.code ?? "AI_FAILED",
    error: (e.message ?? "The draft could not be written").slice(0, 300),
  };
  // Never throw from cleanup — a missing row must not fail the whole Inngest run
  await prisma.proposalDraft.update({ where: { id: draftId }, data }).catch(() => undefined);
}
