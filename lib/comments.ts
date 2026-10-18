// Posting a comment. Every comment goes through the moderator; it is posted only when
// the moderator allows it. Anything not posted carries a reason the writer can read.
import { REVIEW_REASONS, THRESHOLDS } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow } from "@/lib/db/types";
import { moderator } from "@/lib/moderator";

export type SubmitOutcome =
  | { status: "posted"; commentId: string }
  | { status: "rude"; commentId: string; reason: string; suggestion: string | null }
  | { status: "severe"; commentId: string; reason: string }
  | { status: "unsure"; commentId: string; reason: string }
  | { status: "unavailable"; reason: string };

export async function submitComment(authorId: string, postId: string, text: string): Promise<SubmitOutcome> {
  const db = adminDb();
  const { data: post } = await db.from("posts").select("*").eq("id", postId).maybeSingle();
  if (!post) return { status: "unavailable", reason: "This post no longer exists." };

  const result = await moderator().moderate(text, { replyingTo: (post as PostRow).body });
  if (result.verdict === "unavailable") return { status: "unavailable", reason: result.reason };

  const { data, error } = await db
    .from("comments")
    .insert({
      post_id: postId,
      author_id: authorId,
      body: text.trim(),
      score: result.score,
      // "unsure" marks a comment the model couldn't read with confidence (shown to moderators).
      category: result.verdict === "unsure" ? "unsure" : result.category,
      visibility: result.allowed ? "public" : "blocked",
      reason: result.allowed ? null : result.reason,
      rewrite_offered: result.suggestion !== null,
      rewrite_text: result.suggestion,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { status: "unavailable", reason: "We couldn't save this comment, so it hasn't been posted. Please try again." };
  }
  const commentId = (data as { id: string }).id;

  // Severe comments go to the moderators automatically, so a real threat never
  // depends on the writer — or the target — doing anything.
  // Comments the model couldn't read with confidence go to a person too, instead of a guess.
  if (result.verdict === "severe" || result.verdict === "unsure") await db.from("reviews").insert({ comment_id: commentId });
  await broadcastMod();

  if (result.verdict === "clean") return { status: "posted", commentId };
  if (result.verdict === "severe") return { status: "severe", commentId, reason: result.reason };
  if (result.verdict === "unsure") return { status: "unsure", commentId, reason: result.reason };
  return { status: "rude", commentId, reason: result.reason, suggestion: result.suggestion };
}

export type ActionOutcome = { ok: true; status: "posted" | "waiting"; reason?: string } | { ok: false; reason: string };

async function ownUnposted(commentId: string, viewerId: string): Promise<CommentRow | null> {
  const { data } = await adminDb().from("comments").select("*").eq("id", commentId).maybeSingle();
  const c = data as CommentRow | null;
  return c && c.author_id === viewerId && c.visibility === "blocked" ? c : null;
}

/** [Use this] — posts exactly the suggestion the writer was shown; it already passed the check. */
export async function acceptSuggestion(commentId: string, viewerId: string): Promise<ActionOutcome> {
  const c = await ownUnposted(commentId, viewerId);
  if (!c?.rewrite_text) return { ok: false, reason: "There's no suggestion to use for this comment." };
  const { error } = await adminDb()
    .from("comments")
    .update({ body: c.rewrite_text, visibility: "public", reason: null, rewrite_accepted: true })
    .eq("id", commentId);
  if (error) return { ok: false, reason: "That didn't work. Please try again." };
  await broadcastMod();
  return { ok: true, status: "posted" };
}

/** [Ask a moderator] — the comment waits, unposted, for a human. */
export async function askModerator(commentId: string, viewerId: string): Promise<ActionOutcome> {
  const db = adminDb();
  const c = await ownUnposted(commentId, viewerId);
  if (!c) return { ok: false, reason: "This comment can't be sent for review." };
  if ((c.score ?? 0) >= THRESHOLDS.EXTREME_MIN) return { ok: true, status: "waiting", reason: REVIEW_REASONS.FLAGGED };

  const { data: pending } = await db.from("reviews").select("id").eq("comment_id", commentId).is("resolved_at", null).maybeSingle();
  if (!pending) await db.from("reviews").insert({ comment_id: commentId });
  await broadcastMod();
  return { ok: true, status: "waiting", reason: REVIEW_REASONS.WAITING };
}
