import { NextResponse } from "next/server";
import { submitComment } from "@/lib/moderation/pipeline";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 60; // the nudge path can chain several LLM calls

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    postId?: unknown;
    text?: unknown;
    postAsWritten?: unknown;
  } | null;
  if (!body || typeof body.postId !== "string" || typeof body.text !== "string") {
    return NextResponse.json({ error: "expected { postId, text }" }, { status: 400 });
  }

  const outcome = await submitComment(viewer.id, body.postId, body.text, {
    postAsWritten: body.postAsWritten === true,
  });
  return NextResponse.json(outcome);
}
