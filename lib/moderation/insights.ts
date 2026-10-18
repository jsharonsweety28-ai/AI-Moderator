// The slow, nightly queries (CLAUDE.md): freeze-out detection and co-occurrence.
// Both are counting and grouping — no model involved. At demo scale we compute
// them on dashboard load; at real scale this is a nightly batch over the same
// logic.
import { COOCCURRENCE, FREEZEOUT } from "@/lib/config";
import { adminDb } from "@/lib/db/server";
import type { RelationshipRow } from "@/lib/db/types";

export type FreezeoutFlag = {
  handle: string;
  displayName: string;
  coldCount: number;
  coldFrom: string[];
  recentPosts: number;
  priorPosts: number;
};

export type CooccurrencePair = { a: string; b: string; sharedPosts: number };

export type NightlyInsights = {
  freezeouts: FreezeoutFlag[];
  cooccurrence: CooccurrencePair[];
};

export async function getNightlyInsights(): Promise<NightlyInsights | null> {
  const db = adminDb();
  const [relRes, postRes, userRes, commentRes] = await Promise.all([
    db.from("relationships").select("*"),
    db.from("posts").select("author_id, created_at"),
    db.from("users").select("id, handle, display_name"),
    db.from("comments").select("post_id, author_id"),
  ]);
  if (relRes.error || postRes.error || userRes.error || commentRes.error) return null;

  const users = (userRes.data ?? []) as Array<{ id: string; handle: string; display_name: string }>;
  const byId = new Map(users.map((u) => [u.id, u]));

  // ---- freeze-out: cold one-directional ties converging on one person ----
  const coldByTarget = new Map<string, RelationshipRow[]>();
  for (const r of (relRes.data ?? []) as RelationshipRow[]) {
    const cold =
      r.reciprocity <= FREEZEOUT.RECIPROCITY_MAX &&
      r.rough_baseline >= FREEZEOUT.ROUGH_MIN &&
      r.rough_baseline <= FREEZEOUT.ROUGH_MAX &&
      r.msg_count >= FREEZEOUT.MSG_COUNT_MIN;
    if (!cold) continue;
    const list = coldByTarget.get(r.b_id) ?? [];
    list.push(r);
    coldByTarget.set(r.b_id, list);
  }

  const now = Date.now();
  const win = FREEZEOUT.WINDOW_DAYS * 86_400_000;
  const posts = (postRes.data ?? []) as Array<{ author_id: string; created_at: string }>;
  const freezeouts: FreezeoutFlag[] = [];
  for (const [targetId, cold] of coldByTarget) {
    if (cold.length < FREEZEOUT.MIN_COLD_RELATIONSHIPS) continue;
    const own = posts.filter((p) => p.author_id === targetId);
    const recentPosts = own.filter((p) => now - new Date(p.created_at).getTime() <= win).length;
    const priorPosts = own.filter((p) => {
      const age = now - new Date(p.created_at).getTime();
      return age > win && age <= 2 * win;
    }).length;
    // A decline needs a baseline to decline from.
    if (priorPosts === 0 || recentPosts > priorPosts * FREEZEOUT.DECLINE_RATIO) continue;
    const target = byId.get(targetId);
    if (!target) continue;
    freezeouts.push({
      handle: target.handle,
      displayName: target.display_name,
      coldCount: cold.length,
      coldFrom: cold.map((r) => byId.get(r.a_id)?.handle ?? "?").sort(),
      recentPosts,
      priorPosts,
    });
  }

  // ---- co-occurrence: which accounts keep showing up together across posts ----
  const authorsByPost = new Map<string, Set<string>>();
  for (const c of (commentRes.data ?? []) as Array<{ post_id: string; author_id: string }>) {
    const set = authorsByPost.get(c.post_id) ?? new Set<string>();
    set.add(c.author_id);
    authorsByPost.set(c.post_id, set);
  }
  const pairCounts = new Map<string, number>();
  for (const set of authorsByPost.values()) {
    const authors = [...set].sort();
    for (let i = 0; i < authors.length; i++) {
      for (let j = i + 1; j < authors.length; j++) {
        const key = `${authors[i]}|${authors[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const cooccurrence: CooccurrencePair[] = [...pairCounts.entries()]
    .filter(([, n]) => n >= COOCCURRENCE.MIN_SHARED_POSTS)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map(([key, n]) => {
      const [a, b] = key.split("|");
      return {
        a: byId.get(a)?.handle ?? "?",
        b: byId.get(b)?.handle ?? "?",
        sharedPosts: n,
      };
    });

  return { freezeouts, cooccurrence };
}
