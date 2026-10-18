// The human review queue. Two kinds of items: comments whose writer asked a moderator
// (they time out — and stay unposted — if nobody answers), and severe comments sent
// automatically (no deadline; they are evidence).
import { REVIEW, REVIEW_REASONS, THRESHOLDS } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow, ReviewRow, UserRow } from "@/lib/db/types";

export type QueueItem = {
  review: ReviewRow;
  comment: CommentRow & { author: UserRow };
  post: (PostRow & { author: UserRow }) | null;
  /** true: sent automatically because it scored severe. */
  flagged: boolean;
  /** ms left before a requested review times out; null for flagged items. */
  expiresInMs: number | null;
};

const isFlagged = (c: Pick<CommentRow, "score">) => (c.score ?? 0) >= THRESHOLDS.EXTREME_MIN;

/** Expire requested reviews nobody answered. Called on page loads, so no background job is needed. */
export async function expireStaleReviews(): Promise<void> {
  const db = adminDb();
  const cutoff = new Date(Date.now() - REVIEW.TIMEOUT_MS).toISOString();
  const { data } = await db
    .from("reviews")
    .select("id, comment_id, comment:comments(score)")
    .is("resolved_at", null)
    .lt("created_at", cutoff);
  const stale = ((data ?? []) as unknown as Array<{ id: string; comment_id: string; comment: { score: number | null } | null }>)
    .filter((r) => r.comment && !isFlagged(r.comment));
  for (const r of stale) {
    await db.from("comments").update({ reason: REVIEW_REASONS.TIMEOUT }).eq("id", r.comment_id);
    await db.from("reviews").update({ resolved_at: new Date().toISOString() }).eq("id", r.id);
  }
  if (stale.length > 0) await broadcastMod();
}

export async function getQueue(): Promise<QueueItem[] | null> {
  await expireStaleReviews();
  const { data, error } = await adminDb()
    .from("reviews")
    .select("*, comment:comments(*, author:users!comments_author_id_fkey(*), post:posts(*, author:users!posts_author_id_fkey(*)))")
    .is("resolved_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return null;

  const now = Date.now();
  type Joined = ReviewRow & { comment: (CommentRow & { author: UserRow; post: (PostRow & { author: UserRow }) | null }) | null };
  return (data as unknown as Joined[])
    .filter((r) => r.comment)
    .map((r) => {
      const flagged = isFlagged(r.comment!);
      return {
        review: r,
        comment: r.comment!,
        post: r.comment!.post,
        flagged,
        expiresInMs: flagged ? null : Math.max(0, REVIEW.TIMEOUT_MS - (now - new Date(r.created_at).getTime())),
      };
    });
}

export async function resolveReview(reviewId: string, reviewerId: string, decision: "approve" | "uphold"): Promise<{ ok: boolean; error?: string }> {
  const db = adminDb();
  const { data } = await db.from("reviews").select("*").eq("id", reviewId).is("resolved_at", null).maybeSingle();
  const review = data as ReviewRow | null;
  if (!review) return { ok: false, error: "Someone already handled this one." };

  const update =
    decision === "approve"
      ? { visibility: "public", reason: null }
      : { visibility: "blocked", reason: REVIEW_REASONS.REJECTED };
  const { error } = await db.from("comments").update(update).eq("id", review.comment_id);
  if (error) return { ok: false, error: "Couldn't update the comment. Please try again." };

  await db
    .from("reviews")
    .update({ decision, reviewer_id: reviewerId, resolved_at: new Date().toISOString() })
    .eq("id", reviewId);
  await broadcastMod();
  return { ok: true };
}
