// The extension polls this while a comment waits for a moderator.
import { NextResponse } from "next/server";
import { extStatus } from "@/lib/extension";
import { guardExtension } from "@/lib/extension-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = guardExtension(req, { count: false });
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "expected ?id=" }, { status: 400 });
  return NextResponse.json({ status: await extStatus(id) });
}
