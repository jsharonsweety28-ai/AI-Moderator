// The fast background job (CLAUDE.md): per-post pile-on check, every minute.
// A burst alone means nothing — fire only when the burst ALSO shows: mostly
// negative, mostly strangers or new accounts, a cliff-shaped arrival curve, and
// high text similarity (the only LLM signal). Everything else is counting.
import { PILEON, SHIELD, TENSION, THRESHOLDS } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import type { CommentRow, PostRow, RelationshipRow, UserRow } from "@/lib/db/types";
import { expireStaleReviews } from "./queue";
import { checkSimilarity } from "./similarity";

export type SweepResult = {
  decayed: number;
  fired: Array<{ postId: string; signals: Record<string, number> }>;
  forwardedExtremes: number;
};

export async function runPileonSweep(): Promise<SweepResult> {
  const db = adminDb();
  const result: SweepResult = { decayed: 0, fired: [], forwardedExtremes: 0 };

  const { data: postsData } = await db.from("posts").select("*");
  const posts = (postsData ?? []) as PostRow[];
  if (posts.length === 0) return result;

  const now = Date.now();
  const windowStart = new Date(now - PILEON.WINDOW_MS).toISOString();
  const prevStart = new Date(now - 2 * PILEON.WINDOW_MS).toISOString();

  for (const post of posts) {
    let tension = post.tension * (1 - TENSION.DECAY_PER_MINUTE);
    if (tension < 0.005) tension = 0;

    const { data: recentData } = await db
      .from("comments")
      .select("*")
      .eq("post_id", post.id)
      .gte("created_at", windowStart);
    const recent = (recentData ?? []) as CommentRow[];

    if (recent.length >= PILEON.BURST_MIN) {
      const { count: prevCount } = await db
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", post.id)
        .gte("created_at", prevStart)
        .lt("created_at", windowStart);

      const authors = [...new Set(recent.map((c) => c.author_id))].filter((a) => a !== post.author_id);
      const { data: relData } = await db
        .from("relationships")
        .select("a_id, msg_count")
        .eq("b_id", post.author_id)
        .in("a_id", authors);
      const knownIds = new Set(
        ((relData ?? []) as Pick<RelationshipRow, "a_id" | "msg_count">[])
          .filter((r) => r.msg_count >= SHIELD.KNOWN_MSG_MIN)
          .map((r) => r.a_id)
      );
      const { data: userData } = await db.from("users").select("id, created_at").in("id", authors);
      const accountAge = new Map(
        ((userData ?? []) as Pick<UserRow, "id" | "created_at">[]).map((u) => [
          u.id,
          now - new Date(u.created_at).getTime(),
        ])
      );

      const outsiderComments = recent.filter((c) => {
        if (c.author_id === post.author_id) return false;
        const isStranger = !knownIds.has(c.author_id);
        const isNew = (accountAge.get(c.author_id) ?? Infinity) < PILEON.NEW_ACCOUNT_MS;
        return isStranger || isNew;
      });

      const negativeFrac =
        recent.filter((c) => (c.score ?? 0) >= PILEON.NEGATIVE_MIN_SCORE).length / recent.length;
      const outsiderFrac = outsiderComments.length / recent.length;
      const cliff = recent.length >= PILEON.CLIFF_RATIO * Math.max(1, prevCount ?? 0);

      if (negativeFrac >= PILEON.NEGATIVE_FRAC && outsiderFrac >= PILEON.OUTSIDER_FRAC && cliff) {
        // Only now is the (cached) LLM similarity signal worth paying for.
        const similarity = await checkSimilarity(recent.map((c) => c.body).slice(0, 20));
        if (similarity >= PILEON.SIMILARITY_MIN) {
          tension = Math.max(tension, PILEON.TENSION_ON_FIRE);
          result.fired.push({
            postId: post.id,
            signals: {
              burst: recent.length,
              negativeFrac: round2(negativeFrac),
              outsiderFrac: round2(outsiderFrac),
              prev: prevCount ?? 0,
              similarity: round2(similarity),
            },
          });
        }
      }
    }

    // Threats bypass the target entirely: while a post is shielded, every
    // extreme-scored comment in the burst is forwarded to the moderator queue
    // as evidence, whether or not the target ever opens the shield.
    if (tension >= SHIELD.TENSION_MIN) {
      const extremes = recent.filter((c) => (c.score ?? 0) >= THRESHOLDS.EXTREME_MIN);
      for (const c of extremes) {
        const { data: existing } = await db
          .from("reviews")
          .select("id")
          .eq("comment_id", c.id)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          await db.from("reviews").insert({ comment_id: c.id });
          result.forwardedExtremes += 1;
        }
      }
    }

    if (Math.abs(tension - post.tension) > 0.001) {
      await db.from("posts").update({ tension }).eq("id", post.id);
      result.decayed += 1;
    }
  }

  if (result.fired.length > 0 || result.forwardedExtremes > 0) await broadcastMod();
  // Review deadlines ride the same minute tick (expiry broadcasts on its own).
  await expireStaleReviews();
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
