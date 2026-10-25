// Cover-letter prompt + reply cleaning — pure functions, no DB, so they are unit-testable
import type { ChatMessage } from "../lib/openrouter.js";

// What the model may know about the job and the freelancer — no client identity, no other bids
export type DraftContext = {
  job: {
    title: string;
    description: string;
    budgetType: string;
    budget: number; // dollars
    skills: string[];
    category: string | null;
  };
  freelancer: {
    name: string | null;
    title: string | null;
    bio: string | null;
    skills: string[];
    hourlyRate: number | null; // dollars
    location: string | null;
    rating: { average: number | null; count: number };
  };
};

// Hard rules live here rather than in the service so the brief can be tested and tuned alone
const SYSTEM_PROMPT = `You write winning proposals for freelancers on a marketplace.
Write a cover letter the freelancer can send with light edits, in their own first-person voice.
Rules:
- 180-260 words in exactly three short paragraphs separated by a blank line. No other line breaks.
- Paragraph 1: the client's problem or the outcome they want. Never open with "I am writing to apply" or a greeting.
- Paragraph 2: the evidence — 2-3 skills the job asks for that the freelancer actually has. If overlap is thin, be honest and lean on transferable strengths.
- Paragraph 3: how they would approach this specific work, then a concrete next step.
- Plain text, no markdown, no bullet lists, no headings.
- Use only facts in the profile. Never invent employers, clients, metrics, years of experience or certifications.
- Do not mention a price, bid, rate or delivery time — those are separate fields on the form.
- No placeholder brackets, no signature block, no subject line.
Return JSON only, exactly this shape: {"coverLetter":"<the letter>"}`;

// Compact user turn — trimmed by the caller so the prompt stays small on a free model
export function buildDraftMessages(ctx: DraftContext): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ job: ctx.job, freelancer: ctx.freelancer }) },
  ];
}

// Max cover letter length accepted by createProposalSchema minus a small safety margin
const MAX_CHARS = 1900;

// Models wrap letters in fences, echo the label, or add a placeholder greeting — strip all of it
export function cleanDraft(text: string): string {
  let out = text.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "").trim();
  out = out.replace(/^(cover letter|proposal|draft)\s*:\s*/i, "");
  // A greeting aimed at a placeholder ("Dear [Client],") reads as unfinished to clients
  out = out.replace(/^(dear|hi|hello)\b[^\n]{0,60}[,\n]\s*/i, (line) => (/\[|\]|\{|\}|xxx/i.test(line) ? "" : line));
  // Prose lines carry no meaningful indentation — trim both ends of every line
  out = out
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (out.length <= MAX_CHARS) return out;
  // Cut on a word boundary so the letter never ends mid-word
  const cut = out.slice(0, MAX_CHARS);
  return cut.slice(0, cut.lastIndexOf(" ")).trimEnd();
}
