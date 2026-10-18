// The Summarize button: describe the hidden replies without showing them.
// The hidden set is recomputed server-side — never trusted from the client.
import { NextResponse } from "next/server";
import { CRIT_PREF_REASONS, SHIELD } from "@/lib/config";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow } from "@/lib/db/types";
import { isShieldHidden } from "@/lib/feed";
import { summarizeHidden } from "@/lib/moderation/shield";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { postId?: unknown } | null;
  if (!body || typeof body.postId !== "string") {
    return NextResponse.json({ error: "expected { postId }" }, { status: 400 });
  }

  const db = adminDb();
  const { data: postData } = await db.from("posts").select("*").eq("id", body.postId).maybeSingle();
  const post = postData as PostRow | null;
  if (!post || post.author_id !== viewer.id) {
    return NextResponse.json({ error: "Only the post's author can summarize their shield." }, { status: 403 });
  }

  const { data: commentData } = await db.from("comments").select("*").eq("post_id", post.id);
  const comments = (commentData ?? []) as CommentRow[];
  const { data: knownRows } = await db
    .from("relationships")
    .select("a_id, msg_count")
    .eq("b_id", viewer.id)
    .gte("msg_count", SHIELD.KNOWN_MSG_MIN);
  const knownIds = new Set(((knownRows ?? []) as Array<{ a_id: string }>).map((r) => r.a_id));

  // The summary covers the whole pile aimed at the target: what was hidden from
  // their view AND what the pipeline blocked before anyone saw it (threats
  // included — they should never have to read one for it to be acted on).
  const prefReasons = new Set<string>(Object.values(CRIT_PREF_REASONS));
  const hidden = comments.filter(
    (c) =>
      isShieldHidden(c, viewer.id, knownIds) ||
      (c.visibility === "collapsed" && prefReasons.has(c.reason ?? "")) ||
      (c.visibility === "blocked" && !knownIds.has(c.author_id) && c.author_id !== viewer.id)
  );
  if (hidden.length === 0) return NextResponse.json({ summary: "Nothing is hidden right now." });

  const summary = await summarizeHidden(
    hidden.map((c) => ({
      body: c.body,
      category: c.category,
      score: c.score,
      fromStranger: !knownIds.has(c.author_id),
    }))
  );
  return NextResponse.json({ summary });
}
