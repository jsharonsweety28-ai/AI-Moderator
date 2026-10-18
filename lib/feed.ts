// The feed: posts and their posted comments. A writer also sees their own unposted
// comments that a moderator is handling or has handled, with the reason.
import { REVIEW_REASONS, THRESHOLDS } from "@/lib/config";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow, UserRow } from "@/lib/db/types";

type Person = Pick<UserRow, "id" | "handle" | "display_name">;

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: Person;
  /** posted: everyone sees it. waiting / not_posted: only its writer sees it. */
  state: "posted" | "waiting" | "not_posted";
  reason: string | null;
};

export type PostView = {
  id: string;
  body: string;
  createdAt: string;
  author: Person;
  comments: CommentView[];
};

const person = (u: UserRow): Person => ({ id: u.id, handle: u.handle, display_name: u.display_name });

export async function getUsers(): Promise<UserRow[] | null> {
  const { data, error } = await adminDb().from("users").select("*").order("created_at", { ascending: true });
  return error ? null : (data as UserRow[]);
}

export async function getFeed(viewerId: string): Promise<PostView[] | null> {
  const db = adminDb();
  const { data: posts, error } = await db
    .from("posts")
    .select("*, author:users!posts_author_id_fkey(*)")
    .order("created_at", { ascending: false });
  if (error || !posts) return null;

  const { data: comments } = await db
    .from("comments")
    .select("*, author:users!comments_author_id_fkey(*)")
    .or(`visibility.eq.public,author_id.eq.${viewerId}`)
    .order("created_at", { ascending: true });
  const rows = (comments ?? []) as Array<CommentRow & { author: UserRow }>;

  // Which of the viewer's unposted comments have a review (open or closed)?
  const mine = rows.filter((c) => c.visibility === "blocked").map((c) => c.id);
  const { data: reviews } = mine.length
    ? await db.from("reviews").select("comment_id, resolved_at").in("comment_id", mine)
    : { data: [] };
  const reviewed = new Map(((reviews ?? []) as Array<{ comment_id: string; resolved_at: string | null }>).map((r) => [r.comment_id, r.resolved_at]));

  const view = (c: CommentRow & { author: UserRow }): CommentView | null => {
    const base = { id: c.id, body: c.body, createdAt: c.created_at, author: person(c.author) };
    if (c.visibility === "public") return { ...base, state: "posted", reason: null };
    // Drafts the writer already saw explained in the composer don't come back: unreviewed
    // ones, and severe ones (sent to moderators automatically, as evidence).
    if (!reviewed.has(c.id) || (c.score ?? 0) >= THRESHOLDS.EXTREME_MIN) return null;
    const open = reviewed.get(c.id) === null;
    // While waiting, the writer sees the status; the original reason stays on the row for the moderator.
    return { ...base, state: open ? "waiting" : "not_posted", reason: open ? REVIEW_REASONS.WAITING : (c.reason ?? REVIEW_REASONS.REJECTED) };
  };

  return (posts as Array<PostRow & { author: UserRow }>).map((p) => ({
    id: p.id,
    body: p.body,
    createdAt: p.created_at,
    author: person(p.author),
    comments: rows.filter((c) => c.post_id === p.id).map(view).filter((c): c is CommentView => c !== null),
  }));
}
