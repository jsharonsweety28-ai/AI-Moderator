import { NextResponse, after } from "next/server";
import { CRIT_PREFS, type CritPref } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import { reactToPost } from "@/lib/moderation/activity";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 60; // cast reactions run after the response

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { body?: unknown; critPref?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text === "" || text.length > 1000) {
    return NextResponse.json({ error: "post body must be 1-1000 characters" }, { status: 400 });
  }
  const critPref: CritPref = CRIT_PREFS.includes(body?.critPref as CritPref)
    ? (body?.critPref as CritPref)
    : "open";

  const db = adminDb();
  let { data, error } = await db
    .from("posts")
    .insert({ author_id: viewer.id, body: text, crit_pref: critPref })
    .select("id")
    .single();
  if (error && error.message.includes("crit_pref")) {
    // Migration 00003 not run yet — post without the dial rather than failing.
    ({ data, error } = await db.from("posts").insert({ author_id: viewer.id, body: text }).select("id").single());
  }
  if (error || !data) return NextResponse.json({ ok: false, error: "Couldn't publish the post — try again." });
  await broadcastMod();

  // The feed answers back: cast reactions arrive over the next ~20s, after the
  // response returns. Best-effort — a failure means a quiet post, nothing more.
  const postId = (data as { id: string }).id;
  after(async () => {
    try {
      await reactToPost(postId);
    } catch {
      // quiet feed, never a broken post
    }
  });

  return NextResponse.json({ ok: true });
}
