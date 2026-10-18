// Manual trigger: cast reactions to the NEWEST post. (Posts created through the
// app get this automatically — this script re-fires it, e.g. for a seeded post.)
// Run with: npm run activity
import "./load-env";
import { adminDb } from "@/lib/db/server";
import { reactToPost } from "@/lib/moderation/activity";
import type { PostRow, UserRow } from "@/lib/db/types";

async function main() {
  const db = adminDb();
  const { data } = await db
    .from("posts")
    .select("id, body, author:users!posts_author_id_fkey(handle)")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const post = data as unknown as Pick<PostRow, "id" | "body"> & { author: Pick<UserRow, "handle"> };
  console.log(`Reacting to @${post.author.handle}: "${post.body.slice(0, 70)}"\n`);

  const reactions = await reactToPost(post.id);
  for (const r of reactions) {
    console.log(`  @${r.handle.padEnd(9)} ${r.status.padEnd(12)} ${r.text.slice(0, 60)}`);
  }
  console.log("\nDone — open feeds update on their own.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
