// The target controls the shield: default on, theirs to turn off. Stored per
// user in a cookie (dev-switcher world — no auth, no extra schema).
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "no user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (!body || typeof body.on !== "boolean") {
    return NextResponse.json({ error: "expected { on: boolean }" }, { status: 400 });
  }

  const store = await cookies();
  const name = `shield_off_${viewer.id}`;
  if (body.on) store.delete(name);
  else store.set(name, "1", { httpOnly: true, sameSite: "lax", path: "/" });
  return NextResponse.json({ ok: true, on: body.on });
}
