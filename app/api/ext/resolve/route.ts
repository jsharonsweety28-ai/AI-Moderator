// A moderator's decision on a comment from the extension (the /mod page).
import { NextResponse } from "next/server";
import { resolveExt } from "@/lib/extension";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; decision?: unknown } | null;
  const decision = body?.decision;
  if (typeof body?.id !== "string" || (decision !== "approve" && decision !== "reject" && decision !== "seen")) {
    return NextResponse.json({ error: "expected { id, decision: approve|reject|seen }" }, { status: 400 });
  }
  return NextResponse.json(await resolveExt(body.id, viewer.id, decision));
}
