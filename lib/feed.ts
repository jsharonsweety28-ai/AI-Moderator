// Server-side feed assembly. Visibility is resolved HERE, per viewer — the client
// never receives comments the viewer shouldn't know exist. (The one exception is
// the shield: the target has the right to see what was hidden FROM them, so their
// hidden set ships behind the banner's "Show them".)
import { CRIT_PREF_REASONS, REMOVED_BY_AUTHOR_REASON, SHIELD, THRESHOLDS } from "@/lib/config";

/** Reasons written on comfort-dial-collapsed comments — exact-string matched. */
const PREF_REASON_SET = new Set<string>(Object.values(CRIT_PREF_REASONS));
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow, UserRow } from "@/lib/db/types";

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: Pick<UserRow, "id" | "handle" | "display_name">;
  /** visible: rendered normally. collapsed: behind a click. own_blocked: author-only card with reason. */
  state: "visible" | "collapsed" | "own_blocked";
  /** Small label shown next to the comment (e.g. who can see it). */
  tag: string | null;
  /** Author-facing explanation for any non-public state. Never null when not public. */
  reasonShown: string | null;
  actions: Array<"accept_rewrite" | "request_review" | "appeal">;
  pendingReview: boolean;
  /** The stored rewrite [Use this] would post, shown so the author never accepts blind. */
  suggestion?: string | null;
};

export type ShieldView = {
  /** false = the target turned auto-shield off; the comments are visible. */
  engaged: boolean;
  hiddenCount: number;
  /** The hidden comments, for the always-available (never default) "Show them". */
  hidden: CommentView[];
};

export type PostView = {
  id: string;
  body: string;
  createdAt: string;
  tension: number;
  author: Pick<UserRow, "id" | "handle" | "display_name">;
  comments: CommentView[];
  /** Present only for the post's author while the post is shielded. */
  shield: ShieldView | null;
};

type CommentJoined = CommentRow & { author: UserRow };
type PostJoined = PostRow & { author: UserRow; comments: CommentJoined[] };

export async function getFeed(
  viewerId: string,
  opts: { shieldOff?: boolean } = {}
): Promise<PostView[] | null> {
  const db = adminDb();

  const { data, error } = await db
    .from("posts")
    .select("*, author:users!posts_author_id_fkey(*), comments(*, author:users!comments_author_id_fkey(*))")
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "comments", ascending: true });
  if (error || !data) return null;

  const { data: reviewRows } = await db.from("reviews").select("comment_id, decision, resolved_at");
  const reviews = (reviewRows ?? []) as Array<{ comment_id: string; decision: string | null; resolved_at: string | null }>;
  const pendingIds = new Set(reviews.filter((r) => r.decision === null && r.resolved_at === null).map((r) => r.comment_id));
  // A comment gets one trip through review, ever — no re-request loops after a verdict.
  const reviewedIds = new Set(reviews.map((r) => r.comment_id));

  // Who has the viewer muted or blocked? ('block' also hides the whole post.)
  const { data: blockRows } = await db.from("blocks").select("blocked_id, kind").eq("blocker_id", viewerId);
  const blocks = (blockRows ?? []) as Array<{ blocked_id: string; kind: "block" | "mute" }>;
  const hiddenAuthors = new Set(blocks.map((b) => b.blocked_id));
  const hardBlocked = new Set(blocks.filter((b) => b.kind === "block").map((b) => b.blocked_id));

  // Who knows whom (a_id has real history writing to b_id) — for the shield's
  // stranger test AND the bystander heat-collapse, which is defined relative to
  // each post's author, not the viewer.
  const { data: knownRows } = await db
    .from("relationships")
    .select("a_id, b_id, msg_count")
    .gte("msg_count", SHIELD.KNOWN_MSG_MIN);
  const knownByTarget = new Map<string, Set<string>>();
  for (const r of (knownRows ?? []) as Array<{ a_id: string; b_id: string }>) {
    const set = knownByTarget.get(r.b_id) ?? new Set<string>();
    set.add(r.a_id);
    knownByTarget.set(r.b_id, set);
  }
  const knownIds = knownByTarget.get(viewerId) ?? new Set<string>();

  const posts = data as unknown as PostJoined[];
  return posts
    .filter((post) => !hardBlocked.has(post.author_id))
    .map((post) => {
      const comments = post.comments.filter((c) => !hiddenAuthors.has(c.author_id));

      // The author-side shield bucket: pile-on hits (tension-gated) plus
      // comfort-dial-collapsed comments (always). Everyone else's view of
      // these is the collapsed state, never nothing.
      let shield: ShieldView | null = null;
      let shownRaw = comments;
      if (viewerId === post.author_id) {
        const tensionHidden =
          post.tension >= SHIELD.TENSION_MIN
            ? comments.filter((c) => isShieldHidden(c, viewerId, knownIds))
            : [];
        const prefHidden = comments.filter(
          (c) => c.visibility === "collapsed" && PREF_REASON_SET.has(c.reason ?? "")
        );
        const hideRaw = [...new Set([...tensionHidden, ...prefHidden])];
        if (hideRaw.length > 0) {
          const engaged = !opts.shieldOff;
          if (engaged) shownRaw = comments.filter((c) => !hideRaw.includes(c));
          shield = {
            engaged,
            hiddenCount: hideRaw.length,
            hidden: engaged ? hideRaw.map((c) => plainView(c)) : [],
          };
        }
      }

      // Bystander heat-collapse: while a pile-on is active, the burst comments
      // are COLLAPSED (never hidden) for everyone who isn't the target — a
      // visible mob recruits, so it doesn't get an audience by default. One
      // click expands any of them; when tension decays this reverts on its own.
      const heatActive = viewerId !== post.author_id && post.tension >= SHIELD.TENSION_MIN;
      const targetKnown = knownByTarget.get(post.author_id) ?? new Set<string>();

      return {
        id: post.id,
        body: post.body,
        createdAt: post.created_at,
        tension: post.tension,
        author: pick(post.author),
        comments: shownRaw
          .map((c) =>
            presentComment(
              c,
              viewerId,
              post,
              pendingIds.has(c.id),
              reviewedIds.has(c.id),
              heatActive && isShieldHidden(c, post.author_id, targetKnown)
            )
          )
          .filter((c): c is CommentView => c !== null),
        shield,
      };
    });
}

function presentComment(
  c: CommentJoined,
  viewerId: string,
  post: PostJoined,
  pendingReview: boolean,
  hasReview: boolean,
  heatCollapsed = false
): CommentView | null {
  const isOwn = c.author_id === viewerId;
  const isRecipient = post.author_id === viewerId;
  const base = {
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    author: pick(c.author),
    pendingReview,
  };

  switch (c.visibility) {
    case "public":
      if (heatCollapsed) {
        if (isOwn) {
          return {
            ...base,
            state: "visible",
            tag: "Collapsed for others while this thread cools down",
            reasonShown:
              "This thread is overheating, so replies from new voices are collapsed until it calms. Yours is still here — just behind a click.",
            actions: [],
          };
        }
        return { ...base, state: "collapsed", tag: "Thread cooling down", reasonShown: null, actions: [] };
      }
      return { ...base, state: "visible", tag: null, reasonShown: null, actions: [] };

    case "recipient_only":
      if (isOwn || isRecipient) {
        const other = isOwn ? post.author.display_name : c.author.display_name;
        return {
          ...base,
          state: "visible",
          tag: `Shown in full only to you and ${other}`,
          reasonShown: isOwn ? c.reason : null,
          actions: [],
        };
      }
      return { ...base, state: "collapsed", tag: "Rough banter between mutuals", reasonShown: null, actions: [] };

    case "collapsed": {
      if (isOwn) {
        return { ...base, state: "visible", tag: "Collapsed for everyone else", reasonShown: c.reason, actions: [] };
      }
      const byPref = PREF_REASON_SET.has(c.reason ?? "");
      return { ...base, state: "collapsed", tag: byPref ? "Author's post setting" : null, reasonShown: null, actions: [] };
    }

    case "ghosted":
      // Silent by design — used only for reach reduction of coordinated accounts.
      return isOwn ? { ...base, state: "visible", tag: null, reasonShown: null, actions: [] } : null;

    case "blocked": {
      if (!isOwn) return null;
      const removed = c.reason === REMOVED_BY_AUTHOR_REASON;
      const extreme = (c.score ?? 0) >= THRESHOLDS.EXTREME_MIN;
      const actions: CommentView["actions"] =
        removed || pendingReview
          ? []
          : extreme
            ? hasReview
              ? []
              : ["appeal"]
            : c.rewrite_offered
              ? hasReview
                ? ["accept_rewrite"]
                : ["accept_rewrite", "request_review"]
              : hasReview
                ? []
                : ["request_review"];
      return {
        ...base,
        state: "own_blocked",
        tag: removed ? "Removed" : extreme ? "Blocked" : "Not posted yet",
        reasonShown: c.reason ?? "This comment was held by the safety check.",
        actions,
        suggestion: actions.includes("accept_rewrite") ? (c.rewrite_text ?? null) : null,
      };
    }
  }
}

/** Bare rendering for the shield's hidden list — no tags, no actions. */
function plainView(c: CommentJoined): CommentView {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    author: pick(c.author),
    state: "visible",
    tag: null,
    reasonShown: null,
    actions: [],
    pendingReview: false,
  };
}

function pick(u: UserRow): Pick<UserRow, "id" | "handle" | "display_name"> {
  return { id: u.id, handle: u.handle, display_name: u.display_name };
}

/** The one shield predicate, shared by the feed and the summarize route. */
export function isShieldHidden(c: CommentRow, viewerId: string, knownIds: Set<string>): boolean {
  return (
    c.author_id !== viewerId &&
    !knownIds.has(c.author_id) &&
    (c.score ?? 0) >= SHIELD.HIDE_MIN_SCORE &&
    (c.visibility === "public" || c.visibility === "collapsed")
  );
}

export async function getUsers(): Promise<UserRow[] | null> {
  const db = adminDb();
  // The switcher lists the named cast, not the 20 scripted pile-on accounts.
  const { data, error } = await db
    .from("users")
    .select("*")
    .not("handle", "like", "pileon%")
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data as UserRow[]) ?? [];
}
