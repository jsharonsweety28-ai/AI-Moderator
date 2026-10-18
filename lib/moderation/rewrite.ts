// The rewrite generator, self-verifying: a suggestion is only ever offered if it
// already passed AI #1 itself. Generate -> score -> (retry once with feedback) ->
// score. Every step is deterministic and disk-cached, so accepting later replays
// the exact same sequence and gets the exact same text for free.
import type { Category } from "@/lib/config";
import { matchesScript } from "./lang";
import { chat } from "./llm";
import { extractJsonObject, scoreComment } from "./score";
import { REWRITE_FIDELITY_SYSTEM_PROMPT, REWRITE_SYSTEM_PROMPT, TONE_REPHRASE_SYSTEM_PROMPT } from "./prompts";

export type CleanRewrite = {
  text: string;
  score: number;
  category: Category;
};

async function generateOnce(user: string, system = REWRITE_SYSTEM_PROMPT, tag = "rewrite"): Promise<string | null> {
  try {
    const raw = await chat({
      tag,
      system,
      user,
      temperature: 0,
      maxTokens: 400,
    });
    const parsed = extractJsonObject(raw) as { rewrite?: unknown };
    if (typeof parsed.rewrite !== "string" || parsed.rewrite.trim() === "") return null;
    return parsed.rewrite.trim();
  } catch {
    return null;
  }
}

/**
 * The tone offer: for a comment that is CLEAN and posts either way. Returns a
 * de-edged version that itself scored clean and un-coarse, or null — in which
 * case the caller just posts the original (tone friction fails OPEN; only harm
 * fails closed).
 */
export async function generateToneRephrase(text: string): Promise<string | null> {
  const out = await generateOnce(`Comment: ${text}`, TONE_REPHRASE_SYSTEM_PROMPT, "tone_rephrase");
  if (!out || !matchesScript(text, out)) return null;
  const scored = await scoreComment(out);
  if (scored.ok && scored.tier === "clean" && !scored.coarse) return out;
  return null;
}

/**
 * Returns a rewrite that scored clean, or null — in which case the caller falls
 * back to a plain warning. Never crashes, never surfaces an unverified suggestion.
 */
/** Does the rewrite still say what the author was saying? Quality gate, so it
 *  fails OPEN on errors — safety gates (script, clean score) stay closed. */
async function isFaithful(original: string, rewrite: string): Promise<boolean> {
  try {
    const raw = await chat({
      tag: "rewrite_check",
      system: REWRITE_FIDELITY_SYSTEM_PROMPT,
      user: `Original comment: ${original}\nProposed rewrite: ${rewrite}`,
      temperature: 0,
      maxTokens: 60,
    });
    const parsed = extractJsonObject(raw) as { faithful?: unknown };
    return parsed.faithful !== false;
  } catch {
    return true;
  }
}

type Vetted =
  | { ok: true; score: number; category: Category }
  | { ok: false; gate: "language" | "fidelity" | "check" | "score"; why: string };

/** The full gate a candidate rewrite must pass: same language, same meaning, scores clean. */
async function vet(original: string, rewrite: string): Promise<Vetted> {
  if (!matchesScript(original, rewrite)) {
    return { ok: false, gate: "language", why: "it was written in a different language than the original comment" };
  }
  if (!(await isFaithful(original, rewrite))) {
    return { ok: false, gate: "fidelity", why: "it does not say what the author was saying — it invents or changes the point" };
  }
  const scored = await scoreComment(rewrite);
  if (!scored.ok) return { ok: false, gate: "check", why: "it could not be checked" };
  if (scored.tier !== "clean") return { ok: false, gate: "score", why: scored.reason };
  return { ok: true, score: scored.score, category: scored.category };
}

export type RewriteResult =
  | { ok: true; text: string; score: number; category: Category }
  /** irreducible: faithful versions still score as attacks — the message IS the attack.
   *  unfit: attempts were made but none kept the meaning AND passed the scorer.
   *  unavailable: generation or checking failed — a genuinely temporary problem. */
  | { ok: false; why: "irreducible" | "unfit" | "unavailable" };

export async function generateCleanRewrite(text: string, flagReason: string): Promise<RewriteResult> {
  const first = await generateOnce(`Comment: ${text}\nIt was flagged for: ${flagReason}`);
  if (!first) return { ok: false, why: "unavailable" };

  const firstVet = await vet(text, first);
  if (firstVet.ok) return { ok: true, text: first, score: firstVet.score, category: firstVet.category };

  // One retry, feeding back what was wrong with the first attempt.
  const second = await generateOnce(
    `Comment: ${text}\nIt was flagged for: ${flagReason}\n` +
      `Your previous rewrite was: ${first}\n` +
      `That rewrite was rejected because: ${firstVet.why}\n` +
      `Try again — say exactly what the author was saying, minus the abuse, ` +
      `in the exact language and script of the original comment.`
  );
  const secondVet = second ? await vet(text, second) : null;
  if (second && secondVet && secondVet.ok) {
    return { ok: true, text: second, score: secondVet.score, category: secondVet.category };
  }

  // Irreducible only when BOTH faithful attempts still scored as attacks — the
  // comment's whole content is the attack. Judged-but-rejected attempts (meaning
  // or civility gates) are "unfit"; only errors are "unavailable".
  const fails = [firstVet, secondVet].filter(
    (v): v is Extract<Vetted, { ok: false }> => v !== null && !v.ok
  );
  const irreducible =
    firstVet.gate === "score" && secondVet !== null && !secondVet.ok && secondVet.gate === "score";
  const judged = fails.some((f) => f.gate === "score" || f.gate === "fidelity");
  return { ok: false, why: irreducible ? "irreducible" : judged ? "unfit" : "unavailable" };
}
