// One endpoint for the three author actions on a blocked comment:
// accept the rewrite, request an audience review, or appeal an extreme block.
import { NextResponse } from "next/server";
import { acceptRewrite, appealExtreme, requestReview } from "@/lib/moderation/pipeline";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { commentId?: unknown; action?: unknown } | null;
  if (!body || typeof body.commentId !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "expected { commentId, action }" }, { status: 400 });
  }

  const id = body.commentId;
  const outcome =
    body.action === "accept_rewrite"
      ? await acceptRewrite(id, viewer.id)
      : body.action === "request_review"
        ? await requestReview(id, viewer.id)
        : body.action === "appeal"
          ? await appealExtreme(id, viewer.id)
          : null;

  if (!outcome) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return NextResponse.json(outcome);
}
