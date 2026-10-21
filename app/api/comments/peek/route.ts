// The demo site's live typing check: verdict only, cheap, nothing stored.
import { NextResponse } from "next/server";
import { MAX_COMMENT_CHARS } from "@/lib/config";
import { peekFromExtension } from "@/lib/extension";
import { guardExtension } from "@/lib/extension-auth";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });
  const denied = guardExtension(req, { requireKey: false });
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_COMMENT_CHARS) return NextResponse.json({ error: "expected { text }" }, { status: 400 });
  return NextResponse.json(await peekFromExtension(text));
}
