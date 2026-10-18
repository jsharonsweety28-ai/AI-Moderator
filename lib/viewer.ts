// Dev user-switcher: the "current user" is a cookie. No real auth by design (CLAUDE.md).
import { cookies } from "next/headers";
import { adminDb } from "@/lib/db/server";
import type { UserRow } from "@/lib/db/types";

const COOKIE = "dev_user";

/** Resolve the acting user: cookie if set and valid, else the first seeded user. */
export async function getViewer(): Promise<UserRow | null> {
  const db = adminDb();
  const store = await cookies();
  const id = store.get(COOKIE)?.value;

  if (id) {
    const { data } = await db.from("users").select("*").eq("id", id).maybeSingle();
    if (data) return data as UserRow;
  }
  const { data } = await db
    .from("users")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as UserRow) ?? null;
}

export const VIEWER_COOKIE = COOKIE;
