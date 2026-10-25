// Inngest job: write one AI cover letter and store it on the draft row the bid form polls
import { inngest } from "./client.js";
import { generateDraft, markDraftFailed } from "../services/proposal-draft-ai.service.js";

// Sent by POST /api/proposals/draft
export const PROPOSAL_DRAFT_EVENT = "proposal/draft.requested";

type DraftEventData = { draftId: string; userId: string; jobId: string };

export const proposalDraft = inngest.createFunction(
  {
    id: "proposal-draft",
    // Free model pools 429 regularly and reasoning models answer slowly — retry, don't fail the form
    retries: 4,
    // One draft at a time per freelancer, so clicking twice never doubles the model spend
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    triggers: [{ event: PROPOSAL_DRAFT_EVENT }],
    // Runs only once every retry is exhausted — this is what stops the UI polling forever.
    // The failure event wraps the original trigger event, so the draft id is one level deeper.
    onFailure: async ({ event }) => {
      const failure = event.data as {
        error?: { name?: string; message?: string };
        event?: { data?: DraftEventData };
      };
      const draftId = failure.event?.data?.draftId;
      if (!draftId) return;
      await markDraftFailed(draftId, {
        code: failure.error?.name ?? "AI_FAILED",
        message: failure.error?.message ?? "The AI writer kept failing — try again",
      });
    },
  },
  async ({ event, step }) => {
    const { draftId, userId, jobId } = event.data as DraftEventData;

    // Single durable step: the model call is the only slow part, and it is safe to replay
    const result = await step.run("write-cover-letter", () => generateDraft(draftId, userId, jobId));
    return result;
  },
);
