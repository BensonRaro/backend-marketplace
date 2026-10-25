// Inngest job: rank a job's proposals with OpenRouter, one durable step at a time
import { inngest } from "./client.js";
import { loadRecommendationContext } from "../services/recommendation-context.service.js";
import { saveRecommendations, scoreProposals } from "../services/recommendation-ai.service.js";

// Event name sent by the API (client asks for a refresh) and by proposal creation
export const PROPOSAL_RECOMMENDATIONS_EVENT = "proposal/recommendations.requested";

type RecommendationEventData = { jobId: string };

export const proposalRecommendations = inngest.createFunction(
  {
    id: "proposal-recommendations",
    // Free models are upstream-rate-limited — let Inngest retry with backoff
    retries: 3,
    // One run per job at a time, so a burst of new bids never races two rankings
    concurrency: [{ limit: 1, key: "event.data.jobId" }],
    triggers: [{ event: PROPOSAL_RECOMMENDATIONS_EVENT }],
  },
  async ({ event, step }) => {
    const { jobId } = event.data as RecommendationEventData;

    // Step 1 — snapshot the job + bids (skips cleanly when the job has no bids left)
    const context = await step.run("load-job-context", () => loadRecommendationContext(jobId));
    if (!context) return { jobId, analyzed: 0, skipped: "no-bids" };

    // Step 2 — one OpenRouter call, replayed from its own result if a later step fails
    const ranked = await step.run("rank-proposals", () => scoreProposals(context));

    // Step 3 — upsert one shortlist row per bid
    const analyzed = await step.run("save-recommendations", () => saveRecommendations(jobId, ranked));

    return { jobId, analyzed };
  },
);
