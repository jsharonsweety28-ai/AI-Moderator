import { NextResponse } from "next/server";
import { resolveReview } from "@/lib/moderation/queue";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { reviewId?: unknown; decision?: unknown } | null;
  if (
    !body ||
    typeof body.reviewId !== "string" ||
    (body.decision !== "approve" && body.decision !== "uphold")
  ) {
    return NextResponse.json({ error: "expected { reviewId, decision: approve|uphold }" }, { status: 400 });
  }

  const outcome = await resolveReview(body.reviewId, viewer.id, body.decision);
  return NextResponse.json(outcome);
}
