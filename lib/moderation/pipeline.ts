// The comment pipeline (CLAUDE.md). Every path either publishes a scored-clean text
// or leaves the comment non-public WITH a reason. There is no path that publishes
// unscored text, and no error path that defaults to publishing.
import { CRIT_PREF_MIN_SCORE, CRIT_PREF_REASONS, THRESHOLDS, type Category } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow, RelationshipRow } from "@/lib/db/types";
import { judgeAudience } from "./audience";
import { generateCleanRewrite, generateToneRephrase } from "./rewrite";
import { scoreComment } from "./score";

export type SubmitOutcome =
  | { status: "posted"; commentId: string }
  | {
      status: "nudge";
      commentId: string;
      reason: string;
      rewrite: string | null;
      /** Set when no rewrite is offered: the message IS the attack (irreducible),
       *  no version passed the gates (unfit), or a temporary failure (unavailable). */
      noRewriteWhy?: "irreducible" | "unfit" | "unavailable";
    }
  | { status: "blocked_extreme"; commentId: string; reason: string }
  | { status: "failed_closed"; reason: string }
  /** Clean but coarse: nothing inserted yet — the author picks a version, both of which post. */
  | { status: "tone_offer"; original: string; polish: string };

const FAIL_CLOSED_REASON =
  "We couldn't check this comment right now, so it hasn't been posted. Please try again in a moment.";

export async function submitComment(
  authorId: string,
  postId: string,
  text: string,
  opts: { postAsWritten?: boolean } = {}
): Promise<SubmitOutcome> {
  const db = adminDb();

  const { data: post } = await db.from("posts").select("*").eq("id", postId).maybeSingle();
  if (!post) return { status: "failed_closed", reason: "This post no longer exists." };

  // AI #1 — the text alone, every comment, no exceptions.
  const scored = await scoreComment(text);
  if (!scored.ok) return { status: "failed_closed", reason: FAIL_CLOSED_REASON };

  // Clean but coarse -> the tone offer. Nothing is blocked: the author picks the
  // original or the de-edged version, and either posts. If no usable rephrase
  // can be produced, the original posts — tone friction fails open.
  if (scored.tier === "clean" && scored.coarse && !opts.postAsWritten) {
    const polish = await generateToneRephrase(text.trim());
    if (polish) return { status: "tone_offer", original: text.trim(), polish };
  }

  const base = {
    post_id: postId,
    author_id: authorId,
    body: text.trim(),
    score: scored.score,
    category: scored.category,
  };

  let inserted: { id: string } | null = null;
  if (scored.tier === "clean") {
    // The post's comfort dial: clean criticism matching the author's chosen
    // level posts COLLAPSED for everyone (one click opens it; the commenter
    // sees the reason). Only ever tightens; pure praise ("none"/near-zero)
    // always stays public.
    const pref = (post as PostRow).crit_pref ?? "open";
    const prefMatch =
      pref !== "open" &&
      authorId !== (post as PostRow).author_id &&
      scored.score >= CRIT_PREF_MIN_SCORE &&
      (pref === "no_criticism" ? scored.target !== "none" : scored.target === "person");
    const { data, error } = await db
      .from("comments")
      .insert(
        prefMatch
          ? { ...base, visibility: "collapsed", reason: CRIT_PREF_REASONS[pref as "no_personal" | "no_criticism"] }
          : { ...base, visibility: "public", reason: null }
      )
      .select("id")
      .single();
    if (error || !data) return { status: "failed_closed", reason: FAIL_CLOSED_REASON };
    inserted = data;
  } else {
    // rude and extreme both start blocked; they differ in what the author can do next.
    const { data, error } = await db
      .from("comments")
      .insert({
        ...base,
        visibility: "blocked",
        reason: scored.reason,
        rewrite_offered: scored.tier === "rude",
      })
      .select("id")
      .single();
    if (error || !data) return { status: "failed_closed", reason: FAIL_CLOSED_REASON };
    inserted = data;
  }

  // Relationship bookkeeping is code, not model (CLAUDE.md). Attempts count:
  // what A tried to say to B is signal even when it never went public.
  if (authorId !== post.author_id) {
    await bumpRelationship(authorId, (post as PostRow).author_id, scored.score);
  }

  // Every landed comment announces itself so open feeds refresh live.
  await broadcastMod();

  if (scored.tier === "clean") return { status: "posted", commentId: inserted.id };
  if (scored.tier === "extreme") {
    return { status: "blocked_extreme", commentId: inserted.id, reason: scored.reason };
  }

  // rude -> offer a rewrite that has itself already passed the scorer. If none can
  // be produced, the nudge falls back to a plain warning (rewrite: null) — never
  // crash, never auto-publish. (Invariant 7)
  const rewrite = await generateCleanRewrite(text.trim(), scored.reason);
  if (!rewrite.ok) {
    // No suggestion will ever be accepted for this row — don't dangle the button later.
    await db.from("comments").update({ rewrite_offered: false }).eq("id", inserted.id);
    return { status: "nudge", commentId: inserted.id, reason: scored.reason, rewrite: null, noRewriteWhy: rewrite.why };
  }
  // Store exactly what the author is shown, so [Use this] posts that text and
  // nothing else. Best-effort: before migration 00004 the columns don't exist,
  // and acceptRewrite falls back to regenerating.
  await db
    .from("comments")
    .update({ rewrite_text: rewrite.text, rewrite_score: rewrite.score, rewrite_category: rewrite.category })
    .eq("id", inserted.id);
  // Feeds refreshed on insert, before the suggestion existed — refresh again.
  await broadcastMod();
  return { status: "nudge", commentId: inserted.id, reason: scored.reason, rewrite: rewrite.text };
}

export type ActionOutcome =
  | { status: "posted" }
  | { status: "nudge"; reason: string; rewrite: string | null }
  | { status: "recipient_only"; reason: string }
  | { status: "collapsed"; reason: string }
  | { status: "review"; reason: string }
  | { status: "error"; reason: string };

/** [Use this] — the rewrite is itself a comment, so it gets scored like any other. */
export async function acceptRewrite(commentId: string, viewerId: string): Promise<ActionOutcome> {
  const db = adminDb();
  const comment = await ownBlockedComment(commentId, viewerId);
  if (!comment) return { status: "error", reason: "This comment can't be updated." };
  if (!comment.rewrite_offered || (comment.score ?? 1) >= THRESHOLDS.EXTREME_MIN) {
    return { status: "error", reason: "No rewrite is available for this comment." };
  }

  // The stored suggestion is exactly what the author was shown, and it already
  // passed the scorer when it was offered. Rows from before migration 00004 have
  // none — regenerate those (identical only when the disk cache replays it).
  let rewrite: { text: string; score: number; category: Category };
  if (comment.rewrite_text && comment.rewrite_score != null && comment.rewrite_category) {
    rewrite = { text: comment.rewrite_text, score: comment.rewrite_score, category: comment.rewrite_category };
  } else {
    const regenerated = await generateCleanRewrite(comment.body, comment.reason ?? "");
    if (!regenerated.ok) return { status: "error", reason: FAIL_CLOSED_REASON };
    rewrite = regenerated;
  }

  const { error } = await db
    .from("comments")
    .update({
      body: rewrite.text,
      score: rewrite.score,
      category: rewrite.category,
      visibility: "public",
      reason: null,
      rewrite_accepted: true,
    })
    .eq("id", commentId);
  if (error) return { status: "error", reason: FAIL_CLOSED_REASON };
  await broadcastMod();
  return { status: "posted" };
}

/** [Request review] — the author declined the rewrite; AI #2 picks the audience. */
export async function requestReview(commentId: string, viewerId: string): Promise<ActionOutcome> {
  const db = adminDb();
  const comment = await ownBlockedComment(commentId, viewerId);
  if (!comment) return { status: "error", reason: "This comment can't be updated." };
  if ((comment.score ?? 1) >= THRESHOLDS.EXTREME_MIN) {
    return { status: "error", reason: "Severe comments don't get an audience review." };
  }

  const { data: post } = await db.from("posts").select("*").eq("id", comment.post_id).maybeSingle();
  if (!post) return { status: "error", reason: "This post no longer exists." };

  // Code rule, not a model judgment: if the recipient has ever deleted, muted,
  // or blocked this sender, "we're friends" is a claim the recipient has already
  // rejected. recipient_only is off the table — collapsed, deterministically.
  const priorRel = await getRelationship(viewerId, (post as PostRow).author_id);
  if ((priorRel?.negative_reactions ?? 0) > 0) {
    const reason =
      "They've pushed back on your messages before, so this stays collapsed for everyone.";
    const { error: relErr } = await db
      .from("comments")
      .update({ visibility: "collapsed", reason })
      .eq("id", commentId);
    if (relErr) return { status: "error", reason: FAIL_CLOSED_REASON };
    await broadcastMod();
    return { status: "collapsed", reason };
  }

  const judged = await judgeAudience({
    text: comment.body,
    score: comment.score ?? 0.5,
    category: comment.category ?? "other",
    commenterToAuthor: priorRel,
    authorToCommenter: await getRelationship((post as PostRow).author_id, viewerId),
    postTension: (post as PostRow).tension,
  });

  if (judged.decision === "review") {
    // Unclear -> the human queue. The comment stays blocked while it waits.
    await db.from("comments").update({ reason: judged.reason }).eq("id", commentId);
    await db.from("reviews").insert({ comment_id: commentId });
    await broadcastMod();
    return { status: "review", reason: judged.reason };
  }

  const { error } = await db
    .from("comments")
    .update({ visibility: judged.decision, reason: judged.reason })
    .eq("id", commentId);
  if (error) return { status: "error", reason: FAIL_CLOSED_REASON };
  await broadcastMod();
  return { status: judged.decision, reason: judged.reason };
}

/** The slow "this was wrong" link for extreme comments. Low-priority by nature. */
export async function appealExtreme(commentId: string, viewerId: string): Promise<ActionOutcome> {
  const db = adminDb();
  const comment = await ownBlockedComment(commentId, viewerId);
  if (!comment || (comment.score ?? 0) < THRESHOLDS.EXTREME_MIN) {
    return { status: "error", reason: "This comment can't be appealed." };
  }
  const { data: existing } = await db
    .from("reviews")
    .select("id")
    .eq("comment_id", commentId)
    .is("decision", null)
    .maybeSingle();
  if (!existing) {
    await db.from("reviews").insert({ comment_id: commentId });
    await broadcastMod();
  }
  return {
    status: "review",
    reason: "Your appeal was filed. Appeals of severe comments are reviewed slowly, and the comment stays hidden meanwhile.",
  };
}

// ---- helpers ----

async function ownBlockedComment(commentId: string, viewerId: string): Promise<CommentRow | null> {
  const db = adminDb();
  const { data } = await db.from("comments").select("*").eq("id", commentId).maybeSingle();
  const comment = data as CommentRow | null;
  if (!comment || comment.author_id !== viewerId || comment.visibility !== "blocked") return null;
  return comment;
}

async function getRelationship(a: string, b: string): Promise<RelationshipRow | null> {
  const db = adminDb();
  const { data } = await db
    .from("relationships")
    .select("*")
    .eq("a_id", a)
    .eq("b_id", b)
    .maybeSingle();
  return (data as RelationshipRow) ?? null;
}

async function bumpRelationship(a: string, b: string, score: number): Promise<void> {
  const db = adminDb();
  const existing = await getRelationship(a, b);
  if (existing) {
    await db
      .from("relationships")
      .update({
        msg_count: existing.msg_count + 1,
        rough_baseline:
          (existing.rough_baseline * existing.msg_count + score) / (existing.msg_count + 1),
      })
      .eq("a_id", a)
      .eq("b_id", b);
  } else {
    await db.from("relationships").insert({ a_id: a, b_id: b, msg_count: 1, rough_baseline: score });
  }

  // Reciprocity = min/max of the two directions, mirrored onto both rows.
  const ab = (await getRelationship(a, b))?.msg_count ?? 0;
  const reverse = await getRelationship(b, a);
  const ba = reverse?.msg_count ?? 0;
  const reciprocity = Math.max(ab, ba) > 0 ? Math.min(ab, ba) / Math.max(ab, ba) : 0;
  await db.from("relationships").update({ reciprocity }).eq("a_id", a).eq("b_id", b);
  if (reverse) await db.from("relationships").update({ reciprocity }).eq("a_id", b).eq("b_id", a);
}
