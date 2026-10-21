"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExtQueueItem } from "@/lib/extension";
import { relTime } from "@/lib/format";

const SITE_NAMES: Record<string, string> = { youtube: "YouTube", reddit: "Reddit", instagram: "Instagram" };

export function ExtReviewCard({ item }: { item: ExtQueueItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(decision: "approve" | "reject" | "seen") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ext/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, decision }),
      });
      const out = await res.json();
      if (!out.ok) setError(out.error ?? "That didn't work. Please try again.");
      router.refresh();
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const severe = item.verdict === "severe";
  const minutesLeft = item.expiresInMs === null ? null : Math.max(1, Math.ceil(item.expiresInMs / 60_000));

  return (
    <article className={`rounded-2xl border bg-surface p-5 ${severe ? "border-danger-line" : "border-line"}`}>
      <p className="text-sm text-muted">
        <span className="font-semibold text-ink">{SITE_NAMES[item.site] ?? item.site}</span>
        <span className="ml-2" suppressHydrationWarning>
          {severe ? `blocked ${relTime(item.createdAt)} ago, kept as evidence` : `waiting ${relTime(item.createdAt)} because the AI wasn't sure what it means`}
        </span>
      </p>
      <p className="mt-2 text-[15px] leading-relaxed break-words">{item.body}</p>
      {severe && item.reason && <p className="mt-2 text-sm leading-relaxed text-danger">{item.reason}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {severe ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve("seen")}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:border-muted disabled:opacity-50"
          >
            Mark as seen
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resolve("reject")}
              className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Keep it blocked
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resolve("approve")}
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:border-muted disabled:opacity-50"
            >
              Let them post it
            </button>
          </>
        )}
        {minutesLeft !== null && <span className="text-[13px] text-muted">{minutesLeft} min left, then it stays blocked</span>}
        {error && <span className="text-[13px] text-danger">{error}</span>}
      </div>
    </article>
  );
}
