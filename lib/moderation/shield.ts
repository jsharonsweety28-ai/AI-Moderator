// LLM job 5: the shield summary. Describe, count, categorise — never quote.
// On failure, fall back to a code-built summary from stored categories; the
// target always gets an answer.
import { SHIELD, THRESHOLDS } from "@/lib/config";
import { chat } from "./llm";
import { extractJsonObject } from "./score";
import { SHIELD_SUMMARY_SYSTEM_PROMPT } from "./prompts";

export type HiddenComment = {
  body: string;
  category: string | null;
  score: number | null;
  fromStranger: boolean;
};

export async function summarizeHidden(items: HiddenComment[]): Promise<string> {
  const threats = items.filter((i) => (i.score ?? 0) >= THRESHOLDS.EXTREME_MIN).length;
  const strangers = items.filter((i) => i.fromStranger).length;

  try {
    const list = [...items]
      .map((i) => `- (${i.category ?? "?"}, ${i.fromStranger ? "stranger" : "known account"}) ${i.body.slice(0, 160)}`)
      .sort()
      .join("\n");
    const raw = await chat({
      tag: "shield_summary",
      system: SHIELD_SUMMARY_SYSTEM_PROMPT,
      user: `${items.length} hidden replies:\n${list}`,
      temperature: 0,
      maxTokens: 300,
    });
    const parsed = extractJsonObject(raw) as { summary?: unknown };
    // The prompt says never quote; this makes it a guarantee. A summary that
    // repeats any hidden comment falls through to the code-built one.
    if (
      typeof parsed.summary === "string" &&
      parsed.summary.trim() !== "" &&
      !quotesAny(parsed.summary, items.map((i) => i.body))
    ) {
      return parsed.summary.trim();
    }
  } catch {
    // fall through to the code-built summary
  }

  // Fallback: describe, count, categorise from stored fields alone.
  const byCategory = new Map<string, number>();
  for (const i of items) {
    const key = i.category ?? "other";
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const parts = [
    `${items.length} hidden replies, mostly ${top.map(([k, n]) => `${k} (${n})`).join(" and ")}.`,
    strangers > items.length / 2 ? "Nearly all from accounts you haven't interacted with." : "",
    threats > 0 ? `${threats} contained threats — moderators already have them.` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/** Lowercased words with punctuation stripped, in any script. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Does `summary` repeat any hidden comment? True when it shares a run of
 * QUOTE_RUN_WORDS consecutive words with one, or contains a short one whole.
 * Pure code — this is the guarantee behind "summaries never quote".
 */
export function quotesAny(summary: string, bodies: string[]): boolean {
  const hay = ` ${words(summary).join(" ")} `;
  for (const body of bodies) {
    const w = words(body);
    if (w.length < SHIELD.QUOTE_MIN_WORDS) continue;
    const run = Math.min(SHIELD.QUOTE_RUN_WORDS, w.length);
    for (let i = 0; i + run <= w.length; i++) {
      if (hay.includes(` ${w.slice(i, i + run).join(" ")} `)) return true;
    }
  }
  return false;
}
