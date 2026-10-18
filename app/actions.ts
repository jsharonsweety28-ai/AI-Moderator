"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { VIEWER_COOKIE } from "@/lib/viewer";

export async function switchUser(userId: string): Promise<void> {
  const store = await cookies();
  store.set(VIEWER_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/");
}
