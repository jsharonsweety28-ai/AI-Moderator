// Seed data (CLAUDE.md): backdated relationship history is what gives AI #2
// something to reason about. Destructive: wipes and re-creates everything.
// Run with: npm run seed
import "./load-env";
import { adminDb } from "@/lib/db/server";

const db = adminDb();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function main() {
  // Wipe in FK order. (relationships has no created_at — filter on first_seen.)
  for (const table of ["signals", "reports", "reviews", "blocks", "comments", "posts"]) {
    const { error } = await db.from(table).delete().gte("created_at", "1970-01-01");
    if (error) throw new Error(`wiping ${table}: ${error.message}`);
  }
  {
    const { error } = await db.from("relationships").delete().gte("first_seen", "1970-01-01");
    if (error) throw new Error(`wiping relationships: ${error.message}`);
  }
  {
    const { error } = await db.from("users").delete().gte("created_at", "1970-01-01");
    if (error) throw new Error(`wiping users: ${error.message}`);
  }

  // ---- the cast ----
  const cast = [
    { handle: "maya", display_name: "Maya Iyer", created_at: daysAgo(130) },
    { handle: "dev", display_name: "Dev Sharma", created_at: daysAgo(125) }, // banter pair with maya
    { handle: "rohan", display_name: "Rohan Mehta", created_at: daysAgo(95) }, // quietly cold toward priya
    { handle: "priya", display_name: "Priya Nair", created_at: daysAgo(110) }, // freeze-out target
    { handle: "alex_new", display_name: "Alex Fernandes", created_at: daysAgo(1) }, // fresh, no history
    { handle: "sam_new", display_name: "Sam Kulkarni", created_at: daysAgo(2) }, // fresh, no history
    // The freeze-out chorus: with rohan, four one-directional cold ties at priya.
    { handle: "nikhil", display_name: "Nikhil Rao", created_at: daysAgo(100) },
    { handle: "tara", display_name: "Tara Menon", created_at: daysAgo(90) },
    { handle: "vikram", display_name: "Vikram Shetty", created_at: daysAgo(85) },
  ];
  // ~20 scripted accounts for the pile-on demo, all created inside the same 36h window.
  const pileon = Array.from({ length: 20 }, (_, i) => ({
    handle: `pileon${String(i + 1).padStart(2, "0")}`,
    display_name: `User ${4821 + i * 7}`,
    created_at: new Date(Date.now() - 20 * 86_400_000 + i * 1.7 * 3_600_000).toISOString(),
  }));

  const { data: users, error: userErr } = await db.from("users").insert([...cast, ...pileon]).select("id, handle");
  if (userErr || !users) throw new Error(`inserting users: ${userErr?.message}`);
  const id = (handle: string): string => {
    const u = (users as Array<{ id: string; handle: string }>).find((x) => x.handle === handle);
    if (!u) throw new Error(`no seeded user ${handle}`);
    return u.id;
  };

  // ---- relationships (directional!) ----
  const { error: relErr } = await db.from("relationships").insert([
    // maya <-> dev: long, mutual, mildly rough. Banter that should stay visible to each other.
    { a_id: id("maya"), b_id: id("dev"), first_seen: daysAgo(120), msg_count: 242, reciprocity: 0.93, rough_baseline: 0.48, negative_reactions: 0 },
    { a_id: id("dev"), b_id: id("maya"), first_seen: daysAgo(120), msg_count: 260, reciprocity: 0.93, rough_baseline: 0.52, negative_reactions: 0 },
    // rohan -> priya: weeks of one-directional, mildly negative traffic. The freeze-out case.
    { a_id: id("rohan"), b_id: id("priya"), first_seen: daysAgo(45), msg_count: 38, reciprocity: 0.08, rough_baseline: 0.42, negative_reactions: 1 },
    { a_id: id("priya"), b_id: id("rohan"), first_seen: daysAgo(45), msg_count: 3, reciprocity: 0.08, rough_baseline: 0.06, negative_reactions: 0 },
    // Three more quiet, one-directional cold ties at priya. None abusive alone;
    // together with rohan's they cross the freeze-out threshold.
    { a_id: id("nikhil"), b_id: id("priya"), first_seen: daysAgo(50), msg_count: 14, reciprocity: 0.07, rough_baseline: 0.36, negative_reactions: 0 },
    { a_id: id("priya"), b_id: id("nikhil"), first_seen: daysAgo(50), msg_count: 1, reciprocity: 0.07, rough_baseline: 0.04, negative_reactions: 0 },
    { a_id: id("tara"), b_id: id("priya"), first_seen: daysAgo(40), msg_count: 11, reciprocity: 0.09, rough_baseline: 0.33, negative_reactions: 0 },
    { a_id: id("priya"), b_id: id("tara"), first_seen: daysAgo(40), msg_count: 1, reciprocity: 0.09, rough_baseline: 0.05, negative_reactions: 0 },
    { a_id: id("vikram"), b_id: id("priya"), first_seen: daysAgo(35), msg_count: 9, reciprocity: 0.11, rough_baseline: 0.4, negative_reactions: 0 },
    { a_id: id("priya"), b_id: id("vikram"), first_seen: daysAgo(35), msg_count: 1, reciprocity: 0.11, rough_baseline: 0.02, negative_reactions: 0 },
  ]);
  if (relErr) throw new Error(`inserting relationships: ${relErr.message}`);

  // ---- posts ----
  const { data: posts, error: postErr } = await db
    .from("posts")
    .insert([
      { author_id: id("maya"), body: "Shipped the new onboarding flow today 🎉 Two weeks of rebuilding it from scratch. Feels so good to finally see it live.", created_at: hoursAgo(3), tension: 0 },
      { author_id: id("dev"), body: "Hot take: dark mode is overrated and most apps get it wrong anyway.", created_at: hoursAgo(26), tension: 0 },
      { author_id: id("priya"), body: "Been quiet here lately. Working on some things. 🌱", created_at: hoursAgo(50), tension: 0 },
    ])
    .select("id, author_id");
  if (postErr || !posts) throw new Error(`inserting posts: ${postErr?.message}`);
  const postByAuthor = (userId: string): string => {
    const p = (posts as Array<{ id: string; author_id: string }>).find((x) => x.author_id === userId);
    if (!p) throw new Error("post lookup failed");
    return p.id;
  };

  // Priya's older posts: an upbeat, regular cadence that thins out — the
  // posting-rate decline half of the freeze-out signal, visible in the feed.
  const { error: oldPostErr } = await db.from("posts").insert([
    { author_id: id("priya"), body: "Slides from my accessibility talk are up! Link in the usual place ✨", created_at: daysAgo(27), tension: 0 },
    { author_id: id("priya"), body: "Prototype Friday: a tiny animation study 🌊", created_at: daysAgo(24), tension: 0 },
    { author_id: id("priya"), body: "Loved the design meetup tonight — met so many of you!", created_at: daysAgo(20), tension: 0 },
    { author_id: id("priya"), body: "New tutorial going up this week. It's a fun one.", created_at: daysAgo(16), tension: 0 },
  ]);
  if (oldPostErr) throw new Error(`inserting older posts: ${oldPostErr.message}`);

  // ---- comment history ----
  // Pre-system history, seeded in the state the pipeline WOULD have produced.
  const { error: comErr } = await db.from("comments").insert([
    {
      post_id: postByAuthor(id("dev")), author_id: id("maya"),
      body: "your takes get worse every week, delete this 😂",
      created_at: hoursAgo(25), score: 0.5, category: "insult",
      visibility: "recipient_only",
      reason: "Shown to Dev in full — you two have a long history of talking like this to each other. Collapsed for everyone else.",
    },
    {
      post_id: postByAuthor(id("maya")), author_id: id("dev"),
      body: "congrats!! about time, the old flow was a crime scene 💀",
      created_at: hoursAgo(2.5), score: 0.22, category: "clean", visibility: "public", reason: null,
    },
    {
      post_id: postByAuthor(id("maya")), author_id: id("priya"),
      body: "Beautiful work as always 💛",
      created_at: hoursAgo(2), score: 0.02, category: "clean", visibility: "public", reason: null,
    },
    {
      post_id: postByAuthor(id("maya")), author_id: id("alex_new"),
      body: "This looks great, congrats! How long did the rebuild take?",
      created_at: hoursAgo(1.5), score: 0.02, category: "clean", visibility: "public", reason: null,
    },
    {
      post_id: postByAuthor(id("priya")), author_id: id("rohan"),
      body: "hm. interesting that you're calling it 'working on things'",
      created_at: hoursAgo(48), score: 0.3, category: "clean", visibility: "public", reason: null,
    },
    {
      post_id: postByAuthor(id("priya")), author_id: id("tara"),
      body: "oh, you're still doing this then",
      created_at: hoursAgo(46), score: 0.34, category: "clean", visibility: "public", reason: null,
    },
  ]);
  if (comErr) throw new Error(`inserting comments: ${comErr.message}`);

  console.log(`Seeded ${cast.length} named users + ${pileon.length} pile-on accounts, ${(posts as unknown[]).length} posts, 5 comments.`);
  console.log("Cast:", cast.map((c) => c.handle).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
