// Guards for the extension's API: an optional shared key and a per-IP rate limit.
// The key lives in the extension's settings, so treat it as a speed bump, not a secret;
// the rate limit is what protects the model credits.
import { NextResponse } from "next/server";
import { EXTENSION } from "@/lib/config";

const hits = new Map<string, number[]>();

// requireKey: false for the demo site's own routes (same origin, signed-in user).
export function guardExtension(req: Request, { count = true, requireKey = true } = {}): NextResponse | null {
  const key = process.env.EXTENSION_KEY;
  if (requireKey && key && req.headers.get("x-extension-key") !== key) {
    return NextResponse.json({ error: "This extension isn't set up for this server." }, { status: 401 });
  }
  if (!count) return null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > EXTENSION.CHECKS_PER_MINUTE) {
    return NextResponse.json({ error: "Too many checks — wait a minute and try again." }, { status: 429 });
  }
  return null;
}
