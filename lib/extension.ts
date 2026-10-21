// The browser extension's side of the server. The extension blocks a site's Post button
// (YouTube, Reddit) until the comment is allowed; it asks us here. We never post anything
// on those sites ourselves.
import { REVIEW } from "@/lib/config";
import { broadcastMod } from "@/lib/broadcast";
import { adminDb } from "@/lib/db/server";
import { moderator } from "@/lib/moderator";

export const EXT_SITES = ["youtube", "reddit", "instagram", "whatsapp"] as const;
/** Private messages: checked but never stored, never shown to a moderator. */
const PRIVATE_SITES: readonly string[] = ["whatsapp"];
const UNSURE_PRIVATE = "We can't read this one confidently, so it isn't sent. Try rephrasing it more clearly.";
export type ExtSite = (typeof EXT_SITES)[number];

export type ExtCheck = {
  id: string | null;
  allowed: boolean;
  verdict: "clean" | "rude" | "severe" | "unsure" | "unavailable";
  reason: string;
  /** "Personal attack", "Threat"… — what's wrong, in two words. */
  label?: string | null;
  suggestion: string | null;
};

export async function checkFromExtension(text: string, site: ExtSite, replyingTo?: string): Promise<ExtCheck> {
  const result = await moderator().moderate(text, { replyingTo });
  if (result.verdict === "unavailable") {
    return { id: null, allowed: false, verdict: "unavailable", reason: result.reason, suggestion: null };
  }
  if (PRIVATE_SITES.includes(site)) {
    // Nothing is stored and nothing goes to a moderator; an unclear message is rephrased.
    const reason = result.verdict === "unsure" ? UNSURE_PRIVATE : result.reason;
    return { id: null, allowed: result.allowed, verdict: result.verdict, reason, label: result.label ?? null, suggestion: result.suggestion };
  }

  // A person decides what the AI couldn't read; severe ones are kept as evidence.
  const review_status = result.verdict === "unsure" ? "pending" : result.verdict === "severe" ? "flagged" : null;
  const { data, error } = await adminDb()
    .from("ext_checks")
    .insert({
      site,
      body: text,
      verdict: result.verdict,
      score: result.score,
      category: result.category,
      reason: result.reason,
      suggestion: result.suggestion,
      review_status,
    })
    .select("id")
    .single();
  // Can't record it → can't hand it to a person → fail closed.
  if (error || !data) {
    return { id: null, allowed: false, verdict: "unavailable", reason: "We couldn't check this comment right now, so it hasn't been posted. Please try again in a moment.", suggestion: null };
  }
  if (review_status) await broadcastMod();
  return { id: (data as { id: string }).id, allowed: result.allowed, verdict: result.verdict, reason: result.reason, label: result.label ?? null, suggestion: result.suggestion };
}

export type ExtStatus = "pending" | "approved" | "rejected" | "expired" | "none";

/** Where a waiting comment stands. Unanswered requests expire and stay blocked (fail closed). */
export async function extStatus(id: string): Promise<ExtStatus> {
  const db = adminDb();
  const { data } = await db.from("ext_checks").select("review_status, created_at").eq("id", id).maybeSingle();
  const row = data as { review_status: string | null; created_at: string } | null;
  if (!row || !row.review_status) return "none";
  if (row.review_status === "pending" && Date.now() - new Date(row.created_at).getTime() > REVIEW.TIMEOUT_MS) {
    await db.from("ext_checks").update({ review_status: "expired", resolved_at: new Date().toISOString() }).eq("id", id);
    return "expired";
  }
  return ["pending", "approved", "rejected", "expired"].includes(row.review_status) ? (row.review_status as ExtStatus) : "none";
}

export type ExtQueueItem = {
  id: string;
  site: string;
  body: string;
  verdict: "unsure" | "severe";
  reason: string | null;
  createdAt: string;
  expiresInMs: number | null;
};

export async function getExtQueue(): Promise<ExtQueueItem[] | null> {
  const { data, error } = await adminDb()
    .from("ext_checks")
    .select("id, site, body, verdict, reason, review_status, created_at")
    .in("review_status", ["pending", "flagged"])
    .order("created_at", { ascending: true });
  if (error || !data) return null;
  const now = Date.now();
  return (data as Array<{ id: string; site: string; body: string; verdict: string; reason: string | null; review_status: string; created_at: string }>)
    .map((r) => {
      const age = now - new Date(r.created_at).getTime();
      return {
        id: r.id,
        site: r.site,
        body: r.body,
        verdict: r.review_status === "pending" ? ("unsure" as const) : ("severe" as const),
        reason: r.reason,
        createdAt: r.created_at,
        expiresInMs: r.review_status === "pending" ? REVIEW.TIMEOUT_MS - age : null,
      };
    })
    .filter((r) => r.expiresInMs === null || r.expiresInMs > 0);
}

/** approve / reject a waiting comment; "seen" acknowledges a severe one (it stays blocked regardless). */
export async function resolveExt(id: string, reviewerId: string, decision: "approve" | "reject" | "seen"): Promise<{ ok: boolean; error?: string }> {
  const db = adminDb();
  const { data } = await db.from("ext_checks").select("review_status").eq("id", id).maybeSingle();
  const status = (data as { review_status: string | null } | null)?.review_status;
  const valid = (status === "pending" && decision !== "seen") || (status === "flagged" && decision === "seen");
  if (!valid) return { ok: false, error: "Someone already handled this one." };
  const next = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "seen";
  const { error } = await db
    .from("ext_checks")
    .update({ review_status: next, reviewer_id: reviewerId, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't save that. Please try again." };
  await broadcastMod();
  return { ok: true };
}

export type ExtPeek = { verdict: ExtCheck["verdict"]; reason: string; label: string | null };

/** The live hint while typing: verdict only (one model call), nothing stored, nothing sent
 *  to moderators. The real check still happens when the writer clicks Post. */
export async function peekFromExtension(text: string): Promise<ExtPeek> {
  const r = await moderator().moderate(text, { suggest: false });
  return { verdict: r.verdict, reason: r.reason, label: r.label ?? null };
}

/** A better way to say a rude draft — only made when the writer asks for it (badge click). */
export async function suggestFromExtension(text: string, replyingTo?: string): Promise<{ suggestion: string | null; reason: string }> {
  const r = await moderator().moderate(text, { replyingTo });
  return { suggestion: r.verdict === "rude" ? r.suggestion : null, reason: r.reason };
}
