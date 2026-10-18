// Server-side scoring only. A client-side check is a client-side bypass. (CLAUDE.md)
import { NextResponse } from "next/server";
import { scoreComment } from "@/lib/moderation/score";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: "expected { text: string }" }, { status: 400 });
  }

  const result = await scoreComment(body.text);

  if (!result.ok) {
    // Fail closed: if a score can't be computed, the comment stays blocked and the user is told.
    return NextResponse.json({
      tier: "blocked",
      score: null,
      category: null,
      reason:
        "We couldn't check this comment right now, so it hasn't been posted. Please try again in a moment.",
      failedClosed: true,
    });
  }

  const { score, category, reason, tier, coarse } = result;
  return NextResponse.json({ tier, score, category, reason, coarse, failedClosed: false });
}
