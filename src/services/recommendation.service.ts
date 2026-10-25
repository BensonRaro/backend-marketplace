// Recommendation reads + queueing — clients only, ownership enforced here; AI runs in Inngest
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/stripe-verify.js";
import { OPENROUTER_MODEL } from "../lib/openrouter.js";
import { inngest } from "../inngest/client.js";
import { PROPOSAL_RECOMMENDATIONS_EVENT } from "../inngest/proposal-recommendations.js";
import { MAX_RECOMMENDATIONS } from "./recommendation-context.service.js";

// Owner (or admin) only — a client never sees another client's job analysis
async function assertJobOwner(userId: string, role: string, jobId: string) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { clientId: true } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (job.clientId !== userId && role !== "admin") {
    throw apiError("Only the job owner can see recommendations", 403, "FORBIDDEN");
  }
}

// Shortlist for one job — `analyzed < total` tells the UI a background run is still working
export async function getRecommendationsService(userId: string, role: string, jobId: string) {
  await assertJobOwner(userId, role, jobId);

  const [count, insights] = await Promise.all([
    prisma.proposal.count({ where: { jobId, freelancer: { is: { isBanned: false } } } }),
    prisma.proposalRecommendation.findMany({ where: { jobId }, orderBy: { score: "desc" } }),
  ]);

  return {
    jobId,
    total: Math.min(count, MAX_RECOMMENDATIONS),
    analyzed: insights.length,
    truncated: count > MAX_RECOMMENDATIONS,
    model: OPENROUTER_MODEL,
    updatedAt: insights[0]?.updatedAt ?? null,
    recommendations: insights.map((i) => ({
      proposalId: i.proposalId,
      score: i.score,
      summary: i.summary ?? "",
      strengths: i.strengths,
      concerns: i.concerns,
    })),
  };
}

// Queue a fresh analysis — returns as soon as Inngest accepts the event, never waits on the model
export async function requestRecommendationsService(userId: string, role: string, jobId: string) {
  await assertJobOwner(userId, role, jobId);

  const count = await prisma.proposal.count({ where: { jobId, freelancer: { is: { isBanned: false } } } });
  if (!count) throw apiError("No proposals to analyse yet", 400, "NO_PROPOSALS");

  try {
    await inngest.send({ name: PROPOSAL_RECOMMENDATIONS_EVENT, data: { jobId } });
  } catch {
    throw apiError(
      "Could not queue the analysis — is the Inngest dev server running?",
      503,
      "QUEUE_UNAVAILABLE",
    );
  }
  return { jobId, queued: true, total: Math.min(count, MAX_RECOMMENDATIONS) };
}

// Best-effort refresh fired when a bid arrives — bidding must never fail on the AI queue
export async function queueRecommendations(jobId: string) {
  try {
    await inngest.send({ name: PROPOSAL_RECOMMENDATIONS_EVENT, data: { jobId } });
  } catch (err) {
    console.warn("[recommendations] queue failed", (err as Error).message);
  }
}
