// Manual/cron trigger for the pile-on sweep (the in-process interval usually
// covers it; Vercel cron hits this).
import { NextResponse } from "next/server";
import { runPileonSweep } from "@/lib/moderation/pileon";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const result = await runPileonSweep();
  return NextResponse.json(result);
}

export async function GET() {
  return POST();
}
