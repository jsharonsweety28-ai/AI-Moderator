// Cast reactions to a post: short replies generated from the post's actual
// content, submitted through the REAL pipeline (scored, dial-respected,
// broadcast live). Fired automatically after a post is created; also runnable
// manually via npm run activity. Best-effort — a failure means a quiet feed,
// never a broken post.
import { adminDb } from "@/lib/db/server";
import type { PostRow, UserRow } from "@/lib/db/types";
import { chat } from "./llm";
import { submitComment } from "./pipeline";
import { extractJsonObject } from "./score";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PERSONAS: Record<string, string> = {
  dev: "blunt friend with dry humor, says what he actually thinks",
  priya: "warm and encouraging, notices details",
  tara: "reserved and brief, slightly dry",
  alex_new: "curious newcomer who asks a genuine question",
  nikhil: "matter-of-fact colleague",
  sam_new: "enthusiastic, casual internet speech",
};

export type Reaction = { handle: string; status: string; text: string };

export async function reactToPost(postId: string): Promise<Reaction[]> {
  const db = adminDb();
  const { data: postData } = await db
    .from("posts")
    .select("*, author:users!posts_author_id_fkey(*)")
    .eq("id", postId)
    .maybeSingle();
  const post = postData as (PostRow & { author: UserRow }) | null;
  if (!post) return [];

  const handles = Object.keys(PERSONAS).filter((h) => h !== post.author.handle).slice(0, 4);
  const { data: userData } = await db.from("users").select("*").in("handle", handles);
  const users = (userData ?? []) as UserRow[];

  const raw = await chat({
    tag: "activity",
    system:
      `You write short, realistic social-media replies for a demo feed. Given a post and commenter personas, ` +
      `return ONLY a JSON object: {"comments": ["...", ...]} — exactly one reply per persona, in the given order. ` +
      `Each reply: under 120 characters, casual plain register, no hashtags, and it MUST respond to the actual ` +
      `content of the post. Mostly supportive or curious; exactly one is bluntly critical of the content ` +
      `(never of the person). Same language as the post.`,
    user:
      `Post by @${post.author.handle}: ${post.body}\n\nPersonas, in order:\n` +
      handles.map((h) => `- @${h}: ${PERSONAS[h]}`).join("\n"),
    temperature: 0,
    maxTokens: 500,
  });
  const parsed = extractJsonObject(raw) as { comments?: unknown };
  if (!Array.isArray(parsed.comments)) return [];

  const reactions: Reaction[] = [];
  for (let i = 0; i < handles.length && i < parsed.comments.length; i++) {
    const user = users.find((u) => u.handle === handles[i]);
    const text = parsed.comments[i];
    if (!user || typeof text !== "string" || text.trim() === "") continue;
    await sleep(2000 + i * 500); // arrive like people, not like a batch job
    // Scripted actors never sit in interactive offers — post as written.
    const outcome = await submitComment(user.id, post.id, text, { postAsWritten: true });
    reactions.push({ handle: user.handle, status: outcome.status, text });
  }
  return reactions;
}
