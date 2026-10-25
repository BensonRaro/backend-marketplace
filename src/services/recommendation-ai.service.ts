// AI ranking — builds the prompt, calls OpenRouter, normalizes scores, persists the shortlist
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/stripe-verify.js";
import { chatJson, OPENROUTER_MODEL, type ChatMessage } from "../lib/openrouter.js";
import { recommendationResponseSchema } from "../validators/recommendation.validator.js";
import type { RecommendationContext, ScoredProposal } from "./recommendation-context.service.js";

// Prompt for the free Gemma model — JSON-only, one row per bid, judged on evidence only
const SYSTEM_PROMPT = `You are the hiring analyst for a freelance marketplace.
Score how well each proposal fits the job.
Judge only on: overlap with the job's skills and description, evidence of relevant experience, bid price versus budget, and delivery time versus scope.
Never invent facts that are not in the data. Be fair to newer freelancers but reward specific, relevant evidence.
Return JSON only, in exactly this shape:
{"ranked":[{"proposalId":"<id copied from the bid>","score":<integer 0-100>,"summary":"<2 sentences, max 220 characters, why this score>","strengths":["up to 3 short points"],"concerns":["up to 3 short points, empty when none"]}]}
Rank every bid exactly once, using only the given proposalId values. No prose outside the JSON.`;

// Compact, cents-free payload — dollars and short strings keep the prompt small
export function buildRecommendationMessages(ctx: RecommendationContext): ChatMessage[] {
  const brief = {
    title: ctx.job.title,
    description: ctx.job.description,
    category: ctx.job.category,
    budget: { type: ctx.job.budgetType, amountUsd: Math.round(ctx.job.budget / 100) },
    skills: ctx.job.skills,
  };
  const bids = ctx.proposals.map((p) => ({
    proposalId: p.id,
    freelancer: {
      name: p.name,
      headline: p.title,
      skills: p.skills,
      hourlyRateUsd: p.hourlyRate ? Math.round(p.hourlyRate / 100) : null,
      location: p.location,
      rating: p.rating.average,
      reviews: p.rating.count,
      bio: p.bio,
    },
    bidUsd: Math.round(p.bidAmount / 100),
    deliveryDays: p.duration,
    coverLetter: p.coverLetter,
  }));
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `JOB:\n${JSON.stringify(brief)}\n\nBIDS:\n${JSON.stringify(bids)}` },
  ];
}

export type ChatJsonFn = (messages: ChatMessage[], maxTokens?: number) => Promise<unknown>;

// Ask the model to rank bids, then keep only real proposal ids with clamped scores —
// `call` is injectable so the normalization path is testable without network access
export async function scoreProposals(
  ctx: RecommendationContext,
  call: ChatJsonFn = chatJson,
): Promise<ScoredProposal[]> {
  const reply = recommendationResponseSchema.parse(await call(buildRecommendationMessages(ctx)));
  const known = new Set(ctx.proposals.map((p) => p.id));
  const seen = new Set<string>();
  const ranked: ScoredProposal[] = [];

  for (const row of reply.ranked) {
    if (!known.has(row.proposalId) || seen.has(row.proposalId)) continue;
    seen.add(row.proposalId);
    ranked.push({
      proposalId: row.proposalId,
      score: Math.max(0, Math.min(100, Math.round(row.score))),
      summary: row.summary.trim().slice(0, 400),
      strengths: clean(row.strengths),
      concerns: clean(row.concerns),
    });
  }

  if (!ranked.length) throw apiError("Model did not score any of the submitted bids", 502, "AI_BAD_OUTPUT");
  return ranked.sort((a, b) => b.score - a.score);
}

// Keep the list short and de-duplicated so the UI never renders noise
function clean(points: string[], max = 3) {
  return [...new Set(points.map((p) => p.trim()).filter(Boolean))].slice(0, max);
}

// Persist one row per proposal (upsert by proposalId) and drop rows for bids that are gone
export async function saveRecommendations(jobId: string, ranked: ScoredProposal[]) {
  for (const r of ranked) {
    const data = {
      jobId,
      score: r.score,
      summary: r.summary,
      strengths: r.strengths,
      concerns: r.concerns,
      model: OPENROUTER_MODEL,
    };
    await prisma.proposalRecommendation.upsert({
      where: { proposalId: r.proposalId },
      create: { proposalId: r.proposalId, ...data },
      update: data,
    });
  }
  await prisma.proposalRecommendation.deleteMany({    where: { jobId, proposalId: { notIn: ranked.map((r) => r.proposalId) } },
  });
  return ranked.length;
}

