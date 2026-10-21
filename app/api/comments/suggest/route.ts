// The demo site's "better way to say it" for a flagged draft (before posting).
import { NextResponse } from "next/server";
import { MAX_COMMENT_CHARS } from "@/lib/config";
import { adminDb } from "@/lib/db/server";
import { suggestFromExtension } from "@/lib/extension";
import { guardExtension } from "@/lib/extension-auth";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });
  const denied = guardExtension(req, { requireKey: false });
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { text?: unknown; postId?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_COMMENT_CHARS) return NextResponse.json({ error: "expected { text, postId }" }, { status: 400 });
  // The post being replied to shapes the suggestion (never the verdict).
  const { data: post } = typeof body?.postId === "string"
    ? await adminDb().from("posts").select("body").eq("id", body.postId).maybeSingle()
    : { data: null };
  return NextResponse.json(await suggestFromExtension(text, (post as { body: string } | null)?.body));
}
