// Unit tests for AI ranking — normalization + JSON extraction, no network and no DB
import "dotenv/config";
import { describe, expect, test } from "bun:test";
import { scoreProposals, type ChatJsonFn } from "./recommendation-ai.service.js";
import { extractJson } from "../lib/openrouter.js";
import type { RecommendationContext } from "./recommendation-context.service.js";

const ctx: RecommendationContext = {
  jobId: "job-1",
  job: {
    title: "React analytics dashboard",
    description: "Build a dashboard on top of our REST API.",
    budgetType: "fixed",
    budget: 100000,
    skills: ["React", "TypeScript"],
    category: "Development",
  },
  proposals: [
    {
      id: "p1",
      bidAmount: 90000,
      duration: 10,
      coverLetter: "Five years of React dashboards.",
      name: "Ada",
      title: "Frontend engineer",
      bio: null,
      skills: ["React", "TypeScript"],
      hourlyRate: 5000,
      location: "Lagos",
      rating: { average: 4.8, count: 12 },
    },
    {
      id: "p2",
      bidAmount: 20000,
      duration: 30,
      coverLetter: "I can try this.",
      name: "Bo",
      title: null,
      bio: null,
      skills: [],
      hourlyRate: null,
      location: null,
      rating: { average: null, count: 0 },
    },
  ],
};

// Stand-in for the OpenRouter call so the test never touches the network
const fakeReply = (payload: unknown): ChatJsonFn => async () => payload;

describe("scoreProposals", () => {
  test("keeps real bids, clamps scores and sorts by fit", async () => {
    const ranked = await scoreProposals(
      ctx,
      fakeReply({
        ranked: [
          { proposalId: "p2", score: 140, summary: "  Cheap but thin evidence.  ", strengths: ["Budget friendly"], concerns: [] },
          { proposalId: "p1", score: "88", summary: "Direct React experience.", strengths: ["React", "React", " "], concerns: ["Above budget"] },
          { proposalId: "not-a-bid", score: 99, summary: "hallucinated", strengths: [], concerns: [] },
        ],
      }),
    );

    // 140 clamps to 100, so the cheap bid sorts first; the hallucinated id is dropped
    expect(ranked.map((r) => r.proposalId)).toEqual(["p2", "p1"]);
    expect(ranked[0]?.score).toBe(100);
    expect(ranked[1]?.score).toBe(88); // numeric string coerced
    expect(ranked[1]?.summary).toBe("Direct React experience.");
    expect(ranked[1]?.strengths).toEqual(["React"]); // trimmed, blank + duplicate removed
    expect(ranked[0]?.summary).toBe("Cheap but thin evidence.");
  });

  test("drops duplicate rows for the same bid", async () => {
    const ranked = await scoreProposals(
      ctx,
      fakeReply({
        ranked: [
          { proposalId: "p1", score: 70, summary: "first", strengths: [], concerns: [] },
          { proposalId: "p1", score: 90, summary: "second", strengths: [], concerns: [] },
        ],
      }),
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.score).toBe(70);
  });

  test("throws when the model scores none of the submitted bids", async () => {
    const run = scoreProposals(
      ctx,
      fakeReply({ ranked: [{ proposalId: "ghost", score: 50, summary: "x", strengths: [], concerns: [] }] }),
    );
    await expect(run).rejects.toThrow();
  });
});

describe("extractJson", () => {
  test("reads fenced JSON", () => {
    expect(extractJson("```json\n{\"ranked\":[]}\n```")).toEqual({ ranked: [] });
  });

  test("reads JSON surrounded by prose", () => {
    expect(extractJson("Here is the result: {\"ok\":true} — done.")).toEqual({ ok: true });
  });

  test("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
