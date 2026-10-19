// The extension asks: may this comment be posted on YouTube/Reddit?
import { NextResponse } from "next/server";
import { MAX_COMMENT_CHARS } from "@/lib/config";
import { EXT_SITES, checkFromExtension, type ExtSite } from "@/lib/extension";
import { guardExtension } from "@/lib/extension-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = guardExtension(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { text?: unknown; site?: unknown; replyingTo?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const site = body?.site as ExtSite;
  if (!text || text.length > MAX_COMMENT_CHARS || !EXT_SITES.includes(site)) {
    return NextResponse.json({ error: `expected { text (1-${MAX_COMMENT_CHARS} chars), site: ${EXT_SITES.join("|")} }` }, { status: 400 });
  }
  const replyingTo = typeof body?.replyingTo === "string" ? body.replyingTo.slice(0, 500) : undefined;
  return NextResponse.json(await checkFromExtension(text, site, replyingTo));
}
