// Demo data: two people, a few posts, a few friendly replies.
// Destructive: wipes and re-creates everything. Run with: npm run seed
import "./load-env";
import { adminDb } from "@/lib/db/server";

const db = adminDb();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function wipe(table: string, column = "created_at") {
  const { error } = await db.from(table).delete().gte(column, "1970-01-01");
  if (error) throw new Error(`wiping ${table}: ${error.message}`);
}

async function main() {
  // FK order. The older tables (signals, reports, blocks, relationships) are no longer
  // used by the app but are emptied so they hold no stale demo data.
  for (const t of ["signals", "reports", "reviews", "blocks", "comments", "posts", "ext_checks"]) await wipe(t);
  await wipe("relationships", "first_seen");
  await wipe("users");

  const { data: users, error: userErr } = await db
    .from("users")
    .insert([
      { handle: "maya", display_name: "Maya Iyer", created_at: daysAgo(120) },
      { handle: "alex", display_name: "Alex Fernandes", created_at: daysAgo(90) },
    ])
    .select("id, handle");
  if (userErr || !users) throw new Error(`inserting users: ${userErr?.message}`);
  const id = (handle: string) => (users as Array<{ id: string; handle: string }>).find((u) => u.handle === handle)!.id;

  const { data: posts, error: postErr } = await db
    .from("posts")
    .insert([
      { author_id: id("maya"), body: "Got invited to sing at a big event next month!! Pray for me 🎤", created_at: hoursAgo(2) },
      { author_id: id("alex"), body: "Hot take: dark mode is overrated and most apps get it wrong anyway.", created_at: hoursAgo(9) },
      { author_id: id("maya"), body: "Shipped the new onboarding flow today 🎉 Two weeks of rebuilding it from scratch.", created_at: hoursAgo(26) },
    ])
    .select("id, body");
  if (postErr || !posts) throw new Error(`inserting posts: ${postErr?.message}`);
  const post = (start: string) => (posts as Array<{ id: string; body: string }>).find((p) => p.body.startsWith(start))!.id;

  const { error: comErr } = await db.from("comments").insert([
    { post_id: post("Hot take"), author_id: id("maya"), body: "Strong disagree, dark mode saves my eyes at night.", created_at: hoursAgo(8), score: 0.05, category: "clean", visibility: "public" },
    { post_id: post("Shipped"), author_id: id("alex"), body: "This looks great, congrats! How long did the rebuild take?", created_at: hoursAgo(25), score: 0.02, category: "clean", visibility: "public" },
    { post_id: post("Shipped"), author_id: id("maya"), body: "Two weeks, mostly fighting the old form validation 😅", created_at: hoursAgo(24), score: 0.02, category: "clean", visibility: "public" },
  ]);
  if (comErr) throw new Error(`inserting comments: ${comErr.message}`);

  console.log("Seeded 2 people (Maya, Alex), 3 posts, 3 comments.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
