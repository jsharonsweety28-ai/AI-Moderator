// All moderation constants live here. No magic numbers in components. (CLAUDE.md)
// Threshold starting values come from the spec — tune against scripts/eval.ts, do not ship guesses.

export const THRESHOLDS = {
  /** score < CLEAN_MAX -> post publicly */
  CLEAN_MAX: 0.4,
  /** score >= EXTREME_MIN -> hard block, no rewrite, slow appeal only */
  EXTREME_MIN: 0.85,
} as const;

export type Tier = "clean" | "rude" | "extreme";

export function tierForScore(score: number): Tier {
  if (score < THRESHOLDS.CLEAN_MAX) return "clean";
  if (score >= THRESHOLDS.EXTREME_MIN) return "extreme";
  return "rude";
}

export const CATEGORIES = [
  "clean",
  "insult",
  "harassment",
  "threat",
  "hate",
  "sexual",
  "self_harm",
  "spam",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const VISIBILITIES = [
  "public",
  "recipient_only",
  "collapsed",
  "ghosted",
  "blocked",
] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SCORING = {
  /** Never score per keystroke. Debounce typing pauses by this much. */
  TYPING_DEBOUNCE_MS: 500,
  /** LLM request timeout. On timeout we fail closed: the comment stays blocked. */
  LLM_TIMEOUT_MS: 20_000,
  MAX_COMMENT_CHARS: 2_000,
} as const;

export const TENSION = {
  /** posts.tension decays this fraction per minute */
  DECAY_PER_MINUTE: 0.1,
} as const;

export const REVIEW = {
  /**
   * Human review resolves in minutes. Past this deadline the review expires,
   * the comment STAYS blocked (fail closed), and the author is told.
   */
  TIMEOUT_MS: 10 * 60_000,
} as const;

/** Written when a main-lane review expires. The comment stays blocked (fail closed). */
export const REVIEW_TIMEOUT_REASON =
  "A reviewer didn't get to this in time, so it stays hidden. You can edit it and post again.";

/** Written when a moderator upholds a report against a comment that was up. */
export const REPORT_HIDDEN_REASON =
  "Someone reported this, and a moderator agreed it breaks the rules, so it's now hidden. You can edit it and post something new.";

/** Written when a post's author removes a comment from their thread. The feed
 *  compares against this exact string to render the removed state. */
export const REMOVED_BY_AUTHOR_REASON =
  "The post's author removed this from their thread.";

/** The per-post comfort dial, chosen when the post is created. */
export const CRIT_PREFS = ["open", "no_personal", "no_criticism"] as const;
export type CritPref = (typeof CRIT_PREFS)[number];

/**
 * Clean comments scoring at least this can be pref-collapsed. Deliberately above
 * the shield's 0.05 floor: praise scores 0.00-0.05 and real criticism starts
 * ~0.15, so the dial (a permanent per-post setting) must never eat a compliment.
 * The pile-on shield keeps its lower floor — mob context justifies it.
 */
export const CRIT_PREF_MIN_SCORE = 0.1;

/** Reasons written on pref-collapsed comments. The feed matches these exact
 *  strings to route them into the author's shield bucket. */
export const CRIT_PREF_REASONS: Record<Exclude<CritPref, "open">, string> = {
  no_personal:
    "The author asked not to receive personal criticism on this post, so this is collapsed. Anyone can still open it.",
  no_criticism:
    "The author asked for no criticism on this post, so this is collapsed. Anyone can still open it.",
};

/**
 * Pile-on detection (CLAUDE.md): a burst alone means nothing. Fire only when a
 * burst ALSO shows: mostly negative, mostly strangers or new accounts, high text
 * similarity, and a cliff-shaped arrival curve. All thresholds live here.
 */
export const PILEON = {
  WINDOW_MS: 10 * 60_000,
  /** minimum comments inside the window before anything else is even checked */
  BURST_MIN: 8,
  /** a comment counts as negative from this score up (mild digs included) */
  NEGATIVE_MIN_SCORE: 0.15,
  NEGATIVE_FRAC: 0.55,
  /** stranger = no meaningful relationship to the post author */
  OUTSIDER_FRAC: 0.7,
  NEW_ACCOUNT_MS: 7 * 86_400_000,
  /** recent window must be at least this multiple of the previous window */
  CLIFF_RATIO: 3,
  SIMILARITY_MIN: 0.5,
  /** tension set when a pile-on fires */
  TENSION_ON_FIRE: 0.85,
} as const;

/**
 * Freeze-out detection (CLAUDE.md, nightly job): someone with several
 * one-directional, mildly-negative relationships pointing at them while their
 * posting rate declines. Pure GROUP BY — no model involved.
 */
export const FREEZEOUT = {
  /** how many cold, one-directional ties must point at one person */
  MIN_COLD_RELATIONSHIPS: 4,
  /** one-directional = reciprocity at or below this */
  RECIPROCITY_MAX: 0.2,
  /** "mildly negative": cold but not overtly abusive */
  ROUGH_MIN: 0.2,
  ROUGH_MAX: 0.6,
  /** a pattern needs at least this many messages, not a one-off */
  MSG_COUNT_MIN: 3,
  /** compare posting in the last window vs the window before it */
  WINDOW_DAYS: 14,
  /** flag only if recent posts <= this fraction of the prior window's */
  DECLINE_RATIO: 0.5,
} as const;

/** Bot COORDINATION (never "bot detection"): accounts that keep appearing
 *  together across posts. Log-only tier — nothing enforced from here. */
export const COOCCURRENCE = {
  MIN_SHARED_POSTS: 3,
} as const;

export const SHIELD = {
  /** the target-side shield engages at this post tension */
  TENSION_MIN: 0.6,
  /**
   * During a pile-on, hide stranger comments scoring at least this from the
   * target. Deliberately near zero: the pile is made of individually-mild
   * comments, and only clearly-positive ones (praise scores 0.00-0.02) should
   * stay in the target's view while the shield is up.
   */
  HIDE_MIN_SCORE: 0.05,
  /** an author with at least this many prior messages to the target is not a stranger */
  KNOWN_MSG_MIN: 3,
  /**
   * Quote guard: a summary sharing this many consecutive words with any hidden
   * comment counts as quoting it, and is replaced by the code-built summary.
   * Shorter comments are checked whole (from QUOTE_MIN_WORDS words up).
   */
  QUOTE_RUN_WORDS: 4,
  QUOTE_MIN_WORDS: 3,
} as const;

/**
 * The model: NVIDIA Nemotron served by Nebius Token Factory (OpenAI-compatible).
 * Read lazily so scripts can populate process.env from .env.local before first use.
 */
export function llmConfig() {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set");
  return {
    apiKey,
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1",
    // Chosen by eval on 2026-10-18 (63 cases, no cache): Ultra 98.4% with the
    // best rewrites; Super-VL 98.4%, Super 95.2%, Nano 88.9%, Lightning 87.3%.
    model: process.env.LLM_MODEL ?? "nvidia/Nemotron-3-Ultra-550b-a55b",
    /** Ask the model to answer without a reasoning pass. LLM_THINKING=on to allow it. */
    disableThinking: process.env.LLM_THINKING !== "on",
  };
}
