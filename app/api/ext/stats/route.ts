// Development only: how many model calls were made vs answered from memory.
import { NextResponse } from "next/server";
import { modelStats } from "@/lib/moderator";

export function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "not available" }, { status: 404 });
  return NextResponse.json(modelStats);
}
