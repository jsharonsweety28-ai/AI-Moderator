import { NextResponse } from "next/server";
import { muteOrBlock, removeComment, reportComment } from "@/lib/moderation/social";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    commentId?: unknown;
    userId?: unknown;
  } | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "expected { action, ... }" }, { status: 400 });
  }

  const commentId = typeof body.commentId === "string" ? body.commentId : null;
  const userId = typeof body.userId === "string" ? body.userId : null;

  const outcome =
    body.action === "report" && commentId
      ? await reportComment(commentId, viewer.id)
      : (body.action === "mute" || body.action === "block") && userId
        ? await muteOrBlock(viewer.id, userId, body.action, commentId)
        : body.action === "remove" && commentId
          ? await removeComment(viewer.id, commentId)
          : null;

  if (!outcome) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return NextResponse.json(outcome);
}
