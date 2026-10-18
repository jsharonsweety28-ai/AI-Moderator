"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { relTime } from "@/lib/format";

export type ReviewCardData = {
  reviewId: string;
  /** main: the ambiguous middle. appeal: severe tier. report: flagged after it was up. */
  lane: "main" | "appeal" | "report";
  reportCount: number;
  body: string;
  authorName: string;
  authorHandle: string;
  postAuthor: string | null;
  postExcerpt: string | null;
  score: number | null;
  category: string | null;
  reason: string | null;
  createdAt: string;
  expiresInMs: number | null;
};

export function ReviewCard({ item }: { item: ReviewCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(decision: "approve" | "uphold") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: item.reviewId, decision }),
      });
      const out = (await res.json()) as { ok: boolean; error?: string };
      if (!out.ok) setError(out.error ?? "That didn't work — try again.");
      router.refresh();
    } catch {
      setError("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  const severe = item.lane === "appeal";
  const isReport = item.lane === "report";
  const accent = severe ? "text-danger" : "text-moderator";
  const expiresMin = item.expiresInMs !== null ? Math.max(1, Math.ceil(item.expiresInMs / 60_000)) : null;

  return (
    <div className={`rounded-md border bg-card px-4 py-3 ${severe ? "border-danger/30" : "border-line"}`}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] ${accent}`}>
        {item.score !== null && <span className="font-semibold">score {item.score.toFixed(2)}</span>}
        {item.category && <span>{item.category}</span>}
        <span className="text-graphite">waiting {relTime(item.createdAt)}</span>
        {expiresMin !== null && <span className="text-graphite">times out in {expiresMin}m</span>}
        {severe && <span className="font-semibold uppercase">severe — appeal</span>}
        {isReport && (
          <span className="font-semibold uppercase">
            reported {item.reportCount === 1 ? "once" : `${item.reportCount}×`} · still up
          </span>
        )}
      </div>

      <p className="mt-2 text-[15px] leading-relaxed">{item.body}</p>
      <p className="mt-1 font-mono text-[11px] text-graphite">
        @{item.authorHandle}
        {item.postAuthor && item.postExcerpt ? (
          <>
            {" "}
            on {item.postAuthor}&apos;s post: &ldquo;{item.postExcerpt}&rdquo;
          </>
        ) : null}
      </p>
      {item.reason && <p className={`mt-2 font-mono text-xs leading-relaxed ${accent}`}>{item.reason}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void resolve("approve")}
          disabled={busy}
          className="rounded-md bg-moderator px-3 py-1.5 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isReport ? "Keep it up" : "Approve — post it"}
        </button>
        <button
          onClick={() => void resolve("uphold")}
          disabled={busy}
          className="rounded-md border border-line bg-card px-3 py-1.5 font-mono text-xs text-ink hover:border-graphite disabled:opacity-50"
        >
          {isReport ? "Hide it" : "Uphold — keep hidden"}
        </button>
        {busy && <span className="font-mono text-xs text-graphite">…</span>}
        {error && <span className="font-mono text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
