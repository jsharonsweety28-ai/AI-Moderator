// AI #1 wrapper: text in, {score, category, reason, tier} out. Fails closed on every path.
import { CATEGORIES, SCORING, tierForScore, type Category, type Tier } from "@/lib/config";
import { matchesScript } from "./lang";
import { chat } from "./llm";
import { SCORING_SYSTEM_PROMPT } from "./prompts";

export type ScoreResult =
  | {
      ok: true;
      score: number;
      category: Category;
      reason: string;
      tier: Tier;
      /** Coarse register (profanity/edge) independent of harm — drives the tone offer, never a block. */
      coarse: boolean;
      /** What the comment is aimed at — drives the per-post comfort dial. */
      target: "person" | "work" | "none";
    }
  | { ok: false; error: string };

/** Pull the first JSON object out of a model reply, tolerating markdown fences and prose. */
export function extractJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object in model reply");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function scoreComment(text: string): Promise<ScoreResult> {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "empty comment" };
  if (trimmed.length > SCORING.MAX_COMMENT_CHARS) {
    return { ok: false, error: "comment too long" };
  }

  try {
    const raw = await chat({
      tag: "score",
      system: SCORING_SYSTEM_PROMPT,
      user: trimmed,
      temperature: 0,
      maxTokens: 300,
    });

    let parsed = extractJsonObject(raw) as {
      score?: unknown;
      category?: unknown;
      reason?: unknown;
      coarse?: unknown;
      target?: unknown;
    };

    // The model sometimes writes the reason in the wrong language. The score itself is
    // language-independent, so retry once for a matching reason and otherwise
    // keep the first verdict.
    if (typeof parsed.reason === "string" && !matchesScript(trimmed, parsed.reason)) {
      try {
        const retry = await chat({
          tag: "score",
          system: SCORING_SYSTEM_PROMPT,
          user: `${trimmed}\n\n(Write the "reason" in the exact language and script of the comment above.)`,
          temperature: 0,
          maxTokens: 300,
        });
        const reparsed = extractJsonObject(retry) as typeof parsed;
        if (typeof reparsed.reason === "string" && matchesScript(trimmed, reparsed.reason)) {
          parsed = reparsed;
        }
      } catch {
        // keep the first verdict
      }
    }

    // The score is load-bearing. If it is missing or malformed we fail closed —
    // defaulting it to anything would either publish abuse (0) or block everything (1) silently.
    if (typeof parsed.score !== "number" || Number.isNaN(parsed.score)) {
      return { ok: false, error: "model returned no usable score" };
    }
    const score = Math.min(1, Math.max(0, parsed.score));

    const category: Category = CATEGORIES.includes(parsed.category as Category)
      ? (parsed.category as Category)
      : "other";

    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim() !== ""
        ? parsed.reason.trim()
        : "This comment was flagged by the safety check.";

    const target =
      parsed.target === "person" || parsed.target === "work" ? parsed.target : "none";
    return { ok: true, score, category, reason, tier: tierForScore(score), coarse: parsed.coarse === true, target };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
