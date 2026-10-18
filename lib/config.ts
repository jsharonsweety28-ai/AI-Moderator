// All moderation constants live here. No magic numbers in components. (CLAUDE.md)
// Thresholds are tuned against scripts/eval.ts — do not ship guesses.

export const THRESHOLDS = {
  /** score < CLEAN_MAX -> posts */
  CLEAN_MAX: 0.4,
  /** score >= EXTREME_MIN -> severe: not posted, explained, writer rewrites it themselves */
  EXTREME_MIN: 0.85,
  /** non-English comments scoring UNSURE_MIN..CLEAN_MAX go to a person instead of a guess */
  UNSURE_MIN: 0.25,
} as const;

export const REVIEW = {
  /** A requested review that no moderator answers within this time stays unposted (fail closed). */
  TIMEOUT_MS: 10 * 60_000,
} as const;

/** What the writer reads about a comment a moderator is handling. */
export const REVIEW_REASONS = {
  WAITING: "A moderator will look at this shortly. It stays unposted until they decide.",
  FLAGGED: "This was sent to a moderator automatically. It stays unposted.",
  APPROVED: "A moderator approved this.",
  REJECTED: "A moderator looked at this and kept it unposted. You can edit it and post again.",
  TIMEOUT: "No moderator got to this in time, so it stays unposted. You can edit it and post again.",
} as const;

export const MAX_COMMENT_CHARS = 2_000;
