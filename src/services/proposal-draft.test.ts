// Unit tests for the AI proposal writer — prompt shape and reply cleaning, no network and no DB
import { describe, expect, test } from "bun:test";
import { buildDraftMessages, cleanDraft, type DraftContext } from "./proposal-draft.prompt.js";
import { draftReplySchema } from "../validators/proposal-draft.validator.js";

const ctx: DraftContext = {
  job: {
    title: "Shopify storefront rebuild",
    description: "Rebuild our storefront theme for speed and mobile checkout.",
    budgetType: "fixed",
    budget: 2400,
    skills: ["Shopify", "Liquid", "Performance"],
    category: "Development",
  },
  freelancer: {
    name: "Ada",
    title: "Shopify developer",
    bio: "Six years of Liquid theme work.",
    skills: ["Shopify", "Liquid", "React"],
    hourlyRate: 45,
    location: "Lagos",
    rating: { average: 4.8, count: 12 },
  },
};

describe("buildDraftMessages", () => {
  test("sends a system brief plus the job and profile as JSON", () => {
    const [system, user] = buildDraftMessages(ctx);
    expect(system?.role).toBe("system");
    expect(system?.content).toContain("cover letter");
    expect(system?.content).toContain('"coverLetter"'); // asks for the JSON shape it parses

    // The user turn is machine-readable so the model can quote the freelancer's own facts
    const payload = JSON.parse(user!.content) as DraftContext;
    expect(payload.job.title).toBe("Shopify storefront rebuild");
    expect(payload.job.budget).toBe(2400);
    expect(payload.freelancer.skills).toContain("Liquid");
  });
});

describe("cleanDraft", () => {
  test("strips code fences and an echoed label", () => {
    expect(cleanDraft("```text\nCover letter: I rebuilt three storefronts.\n```")).toBe("I rebuilt three storefronts.");
  });

  test("drops a greeting aimed at a placeholder but keeps a real one", () => {
    expect(cleanDraft("Dear [Client],\n\nYour checkout is slow.")).toBe("Your checkout is slow.");
    expect(cleanDraft("Hi Sam,\n\nYour checkout is slow.")).toBe("Hi Sam,\n\nYour checkout is slow.");
  });

  test("collapses runs of blank lines and trims edges", () => {
    expect(cleanDraft("\n\n  First point.  \n\n\n\n  Second point.  \n\n")).toBe("First point.\n\nSecond point.");
  });

  test("truncates very long drafts on a word boundary", () => {
    const long = "word ".repeat(600); // 3000 chars, above the 1900 cap
    const out = cleanDraft(long);
    expect(out.length).toBeLessThanOrEqual(1900);
    expect(out.endsWith("word")).toBe(true); // no half-cut word
  });
});

describe("draftReplySchema", () => {
  test("accepts camelCase and snake_case replies", () => {
    const body = "a".repeat(200);
    expect(draftReplySchema.parse({ coverLetter: body }).coverLetter).toBe(body);
    expect(draftReplySchema.parse({ cover_letter: `  ${body}  ` }).coverLetter).toBe(body);
  });

  test("rejects an empty or stub reply", () => {
    expect(() => draftReplySchema.parse({ coverLetter: "Sure!" })).toThrow();
    expect(() => draftReplySchema.parse({})).toThrow();
  });
});
