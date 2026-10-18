// The human review queue. Humans handle the unclear, not the worst: the main
// queue is the ambiguous middle; extreme-tier appeals sit in a separate
// low-priority section with no deadline; reported comments get their own lane.
// Timeouts fail closed.
import { REPORT_HIDDEN_REASON, REVIEW, REVIEW_TIMEOUT_REASON, THRESHOLDS } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow, ReviewRow, UserRow } from "@/lib/db/types";

export type QueueItem = {
  review: ReviewRow;
  comment: CommentRow & { author: UserRow };
  post: (PostRow & { author: UserRow }) | null;
  /** ms until this review times out; null for appeals and reports (no deadline). */
  expiresInMs: number | null;
  /** How many people reported this comment; 0 outside the reports lane. */
  reportCount: number;
};

type ReviewJoined = ReviewRow & {
  comment:
    | (CommentRow & { author: UserRow; post: (PostRow & { author: UserRow }) | null })
    | null;
};

type Lane = "main" | "appeal" | "report";

function laneFor(comment: Pick<CommentRow, "id" | "score">, reported: Map<string, number>): Lane {
  if (reported.has(comment.id)) return "report";
  if ((comment.score ?? 0) >= THRESHOLDS.EXTREME_MIN) return "appeal";
  return "main";
}

/** comment_id -> number of reports, for the given comments. */
async function reportCounts(commentIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (commentIds.length === 0) return counts;
  const { data } = await adminDb().from("reports").select("comment_id").in("comment_id", commentIds);
  for (const r of (data ?? []) as Array<{ comment_id: string }>) {
    counts.set(r.comment_id, (counts.get(r.comment_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fail closed on timeout: an expired main-lane review keeps the comment blocked
 * and tells the author (their comment card shows the new reason). Appeals and
 * reports have no deadline. Called from the dashboard, the feed, and the
 * per-minute sweep, so expiry never depends on a moderator opening /mod.
 */
export async function expireStaleReviews(): Promise<number> {
  const db = adminDb();
  const cutoff = new Date(Date.now() - REVIEW.TIMEOUT_MS).toISOString();
  const { data } = await db
    .from("reviews")
    .select("id, comment_id, comment:comments(id, score)")
    .is("decision", null)
    .is("resolved_at", null)
    .lt("created_at", cutoff);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    comment_id: string;
    comment: Pick<CommentRow, "id" | "score"> | null;
  }>;
  if (rows.length === 0) return 0;

  const reported = await reportCounts(rows.map((r) => r.comment_id));
  const expired = rows.filter((r) => r.comment && laneFor(r.comment, reported) === "main");
  for (const r of expired) {
    await db.from("comments").update({ reason: REVIEW_TIMEOUT_REASON }).eq("id", r.comment_id);
    await db.from("reviews").update({ resolved_at: new Date().toISOString() }).eq("id", r.id);
  }
  if (expired.length > 0) await broadcastMod();
  return expired.length;
}

export async function getModQueue(): Promise<{
  main: QueueItem[];
  appeals: QueueItem[];
  reports: QueueItem[];
} | null> {
  await expireStaleReviews();

  const db = adminDb();
  const { data, error } = await db
    .from("reviews")
    .select(
      "*, comment:comments(*, author:users!comments_author_id_fkey(*), post:posts(*, author:users!posts_author_id_fkey(*)))"
    )
    .is("decision", null)
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return null;

  const rows = data as unknown as ReviewJoined[];
  const reported = await reportCounts(rows.map((r) => r.comment_id));
  const now = Date.now();
  const main: QueueItem[] = [];
  const appeals: QueueItem[] = [];
  const reports: QueueItem[] = [];

  for (const r of rows) {
    if (!r.comment) continue;
    const lane = laneFor(r.comment, reported);
    const age = now - new Date(r.created_at).getTime();
    const item: QueueItem = {
      review: r,
      comment: r.comment,
      post: r.comment.post,
      expiresInMs: lane === "main" ? Math.max(0, REVIEW.TIMEOUT_MS - age) : null,
      reportCount: reported.get(r.comment_id) ?? 0,
    };
    (lane === "report" ? reports : lane === "appeal" ? appeals : main).push(item);
  }

  return { main, appeals, reports };
}

export type ResolveOutcome = { ok: true } | { ok: false; error: string };

export async function resolveReview(
  reviewId: string,
  reviewerId: string,
  decision: "approve" | "uphold"
): Promise<ResolveOutcome> {
  const db = adminDb();
  const { data } = await db
    .from("reviews")
    .select("*, comment:comments(id, score, visibility)")
    .eq("id", reviewId)
    .is("decision", null)
    .is("resolved_at", null)
    .maybeSingle();
  const review = data as (ReviewRow & { comment: Pick<CommentRow, "id" | "score" | "visibility"> | null }) | null;
  if (!review || !review.comment) return { ok: false, error: "This review was already handled." };

  const lane = laneFor(review.comment, await reportCounts([review.comment_id]));
  let update: { visibility: CommentRow["visibility"]; reason: string } | null;
  if (lane === "report") {
    // A report is about a comment that is already out there. Approve = the
    // report doesn't hold up: leave the comment exactly as it is (never loosen
    // it — the author may have removed it meanwhile). Uphold = take it down,
    // with a reason the commenter can read.
    update =
      decision === "uphold" && review.comment.visibility !== "blocked"
        ? { visibility: "blocked", reason: REPORT_HIDDEN_REASON }
        : null;
  } else {
    update =
      decision === "approve"
        ? { visibility: "public", reason: "A human reviewer approved this comment." }
        : {
            visibility: "blocked",
            reason: "A human reviewer looked at this and kept it hidden. You can edit it and post something new.",
          };
  }
  if (update) {
    const { error } = await db.from("comments").update(update).eq("id", review.comment_id);
    if (error) return { ok: false, error: "Couldn't update the comment." };
  }

  await db
    .from("reviews")
    .update({ decision, reviewer_id: reviewerId, resolved_at: new Date().toISOString() })
    .eq("id", reviewId);
  // The training loop: every reviewer decision is an appended signal, forever.
  await db.from("signals").insert({
    comment_id: review.comment_id,
    kind: decision === "approve" ? "reviewer_approve" : "reviewer_uphold",
  });
  await broadcastMod();
  return { ok: true };
}
