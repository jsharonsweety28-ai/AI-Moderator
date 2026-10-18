// The writer's two actions on an unposted comment: use the suggestion, or ask a moderator.
import { NextResponse } from "next/server";
import { askModerator, acceptSuggestion } from "@/lib/comments";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { commentId?: unknown; action?: unknown } | null;
  if (typeof body?.commentId !== "string") return NextResponse.json({ error: "expected { commentId, action }" }, { status: 400 });

  if (body.action === "use_suggestion") return NextResponse.json(await acceptSuggestion(body.commentId, viewer.id));
  if (body.action === "ask_moderator") return NextResponse.json(await askModerator(body.commentId, viewer.id));
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
