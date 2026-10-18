import { NextResponse } from "next/server";
import { submitComment } from "@/lib/comments";
import { MAX_COMMENT_CHARS } from "@/lib/config";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 60; // a rude comment chains a few model calls for its suggestion

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { postId?: unknown; text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (typeof body?.postId !== "string" || !text || text.length > MAX_COMMENT_CHARS) {
    return NextResponse.json({ error: `expected { postId, text } with 1-${MAX_COMMENT_CHARS} characters` }, { status: 400 });
  }
  return NextResponse.json(await submitComment(viewer.id, body.postId, text));
}
