// Inngest — client + function registry served at /api/inngest
import { inngest } from "./client.js";
import { proposalRecommendations } from "./proposal-recommendations.js";
import { proposalDraft } from "./proposal-draft.js";

export { inngest };

// Quickstart smoke test — proves the serve endpoint is wired
const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: [{ event: "test/hello.world" }] },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data?.email ?? "world"}!` };
  },
);

// Every function must be listed here — Inngest reads this array via the serve endpoint
export const functions = [helloWorld, proposalRecommendations, proposalDraft];
