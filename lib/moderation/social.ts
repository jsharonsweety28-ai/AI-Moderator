// Report / mute / block / remove. All of it is code and SQL — and every action
// lands in the append-only signals table, which is the training data.
import { REMOVED_BY_AUTHOR_REASON } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow } from "@/lib/db/types";

export type SocialOutcome = { ok: true; note: string } | { ok: false; error: string };

export async function reportComment(commentId: string, reporterId: string): Promise<SocialOutcome> {
  const db = adminDb();
  const { data: comment } = await db.from("comments").select("id, author_id").eq("id", commentId).maybeSingle();
  if (!comment) return { ok: false, error: "This comment no longer exists." };
  if ((comment as CommentRow).author_id === reporterId) {
    return { ok: false, error: "You can't report your own comment." };
  }

  const { data: existing } = await db
    .from("reports")
    .select("id")
    .eq("comment_id", commentId)
    .eq("reporter_id", reporterId)
    .maybeSingle();
  if (existing) return { ok: true, note: "Already reported." };

  const { error } = await db.from("reports").insert({ comment_id: commentId, reporter_id: reporterId });
  if (error) return { ok: false, error: "Couldn't send the report — try again." };
  await db.from("signals").insert({ comment_id: commentId, kind: "reported" });

  // The promise below has to be true: a report opens a moderator review (one per
  // comment, however many people report it). The comment stays up meanwhile —
  // a report alone never hides anything, or reporting becomes a takedown button.
  const { data: pending } = await db
    .from("reviews")
    .select("id")
    .eq("comment_id", commentId)
    .is("decision", null)
    .is("resolved_at", null)
    .limit(1)
    .maybeSingle();
  if (!pending) await db.from("reviews").insert({ comment_id: commentId });
  await broadcastMod();
  return { ok: true, note: "Reported — a moderator will see this." };
}

export async function muteOrBlock(
  viewerId: string,
  targetUserId: string,
  kind: "mute" | "block",
  commentId: string | null
): Promise<SocialOutcome> {
  const db = adminDb();
  if (viewerId === targetUserId) return { ok: false, error: "That's you." };

  await db
    .from("blocks")
    .upsert(
      { blocker_id: viewerId, blocked_id: targetUserId, kind },
      { onConflict: "blocker_id,blocked_id,kind", ignoreDuplicates: true }
    );

  // The relationship ledger: target reacted negatively to this account's traffic.
  await bumpNegativeReaction(targetUserId, viewerId);

  // Signals are per-comment and target-authored: only when the person muting is
  // the one the comment was aimed at (the post's author).
  if (commentId) {
    const { data } = await db
      .from("comments")
      .select("author_id, post:posts(author_id)")
      .eq("id", commentId)
      .maybeSingle();
    const row = data as { author_id: string; post: { author_id: string } | null } | null;
    if (row && row.post && row.post.author_id === viewerId && row.author_id === targetUserId) {
      await db.from("signals").insert({
        comment_id: commentId,
        kind: kind === "mute" ? "target_muted" : "target_blocked",
      });
    }
  }

  return {
    ok: true,
    note: kind === "mute" ? "Muted — you won't see them anymore." : "Blocked — they're gone from your feed.",
  };
}

export async function removeComment(viewerId: string, commentId: string): Promise<SocialOutcome> {
  const db = adminDb();
  const { data } = await db
    .from("comments")
    .select("*, post:posts(*)")
    .eq("id", commentId)
    .maybeSingle();
  const comment = data as (CommentRow & { post: PostRow | null }) | null;
  if (!comment || !comment.post) return { ok: false, error: "This comment no longer exists." };
  if (comment.post.author_id !== viewerId) {
    return { ok: false, error: "Only the post's author can remove replies." };
  }
  if (comment.author_id === viewerId) return { ok: false, error: "That's your own comment." };
  if (comment.visibility === "blocked") return { ok: true, note: "Already hidden." };

  const { error } = await db
    .from("comments")
    .update({ visibility: "blocked", reason: REMOVED_BY_AUTHOR_REASON })
    .eq("id", commentId);
  if (error) return { ok: false, error: "Couldn't remove it — try again." };

  await db.from("signals").insert({ comment_id: commentId, kind: "target_deleted" });
  await bumpNegativeReaction(comment.author_id, viewerId);
  await broadcastMod();
  return { ok: true, note: "Removed from your thread." };
}

/** rel(a -> b).negative_reactions++ : b reacted negatively to a's traffic. */
async function bumpNegativeReaction(a: string, b: string): Promise<void> {
  const db = adminDb();
  const { data } = await db
    .from("relationships")
    .select("negative_reactions")
    .eq("a_id", a)
    .eq("b_id", b)
    .maybeSingle();
  if (data) {
    await db
      .from("relationships")
      .update({ negative_reactions: (data as { negative_reactions: number }).negative_reactions + 1 })
      .eq("a_id", a)
      .eq("b_id", b);
  } else {
    await db.from("relationships").insert({ a_id: a, b_id: b, msg_count: 0, negative_reactions: 1 });
  }
}
