// The pile-on demo: the 20 scripted accounts flood Maya's newest post through
// the REAL pipeline (every comment scored), then one sweep runs. Most of the
// flood is individually-mild negativity — that's the point: a pile-on is made of
// comments that each pass on their own. The harm is the aggregate.
// Run with: npm run pileon
import "./load-env";
import { adminDb } from "@/lib/db/server";
import { runPileonSweep } from "@/lib/moderation/pileon";
import { submitComment } from "@/lib/moderation/pipeline";
import type { PostRow, UserRow } from "@/lib/db/types";

const FLOOD: string[] = [
  "this is embarrassing lol",
  "two whole weeks for THIS?",
  "who approved this 💀",
  "delete this app",
  "yikes.",
  "the old one was better and that's saying something",
  "screenshotting this for the group chat lmao",
  "took two weeks to make it worse",
  "aggressively mid",
  "somebody had to say it: it's bad",
  "this is why the app is dying",
  "the confidence is wild",
  "not the flexing over a settings page",
  "my little cousin designs better onboarding",
  "ratio",
  "imagine being proud of this",
  "L + delete",
  // the harsher tail every pile-on drags in:
  "you're a talentless hack, uninstall yourself",
  "maya you fraud, everything you touch turns to garbage",
  "keep posting and I'll make sure you regret it",
  "I know where you live maya. watch yourself.",
];

async function main() {
  const db = adminDb();
  const { data: userData } = await db.from("users").select("*").like("handle", "pileon%").order("handle");
  const attackers = (userData ?? []) as UserRow[];
  if (attackers.length === 0) throw new Error("no pileon accounts — run npm run seed first");

  const { data: mayaData } = await db.from("users").select("id").eq("handle", "maya").single();
  // Pinned to the seeded onboarding post — the flood's lines are written for it.
  // ("Newest post by maya" broke the moment a new post was composed as maya.)
  const { data: postData } = await db
    .from("posts")
    .select("*")
    .eq("author_id", (mayaData as { id: string }).id)
    .ilike("body", "%onboarding%")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!postData) throw new Error("Maya's onboarding post not found — run npm run seed first");
  const post = postData as PostRow;

  // Idempotent for rehearsals: clear any previous run's pile (children first),
  // and reset the attackers' relationship rows so they stay strangers.
  const attackerIds = attackers.map((a) => a.id);
  const { data: oldComments } = await db
    .from("comments")
    .select("id")
    .eq("post_id", post.id)
    .in("author_id", attackerIds);
  const oldIds = ((oldComments ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (oldIds.length > 0) {
    for (const table of ["signals", "reports", "reviews"]) {
      await db.from(table).delete().in("comment_id", oldIds);
    }
    await db.from("comments").delete().in("id", oldIds);
    await db.from("relationships").delete().in("a_id", attackerIds);
    console.log(`(cleared ${oldIds.length} comments from a previous run)\n`);
  }

  console.log(`Firing ${FLOOD.length} comments at Maya's post through the real pipeline…\n`);
  for (let i = 0; i < FLOOD.length; i++) {
    const author = attackers[i % attackers.length];
    // Scripted attackers never take the tone offer — bypass it so the pile lands.
    const outcome = await submitComment(author.id, post.id, FLOOD[i], { postAsWritten: true });
    console.log(`  @${author.handle.padEnd(9)} ${outcome.status.padEnd(16)} ${FLOOD[i].slice(0, 50)}`);
  }

  console.log("\nRunning the pile-on sweep…");
  const result = await runPileonSweep();
  console.log("fired:", JSON.stringify(result.fired, null, 1));
  console.log("extremes forwarded to moderators:", result.forwardedExtremes);

  const { data: after } = await db.from("posts").select("tension").eq("id", post.id).single();
  console.log(`post tension now: ${(after as { tension: number }).tension}`);
  console.log("\nOpen the feed as @maya to see the shield.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
