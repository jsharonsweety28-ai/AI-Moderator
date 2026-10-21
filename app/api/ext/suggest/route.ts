// A better way to say a rude draft, made only when the writer asks (clicks the badge).
import { NextResponse } from "next/server";
import { MAX_COMMENT_CHARS } from "@/lib/config";
import { suggestFromExtension } from "@/lib/extension";
import { guardExtension } from "@/lib/extension-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = guardExtension(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { text?: unknown; replyingTo?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_COMMENT_CHARS) return NextResponse.json({ error: "expected { text }" }, { status: 400 });
  const replyingTo = typeof body?.replyingTo === "string" ? body.replyingTo.slice(0, 500) : undefined;
  return NextResponse.json(await suggestFromExtension(text, replyingTo));
}
