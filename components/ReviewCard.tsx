"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QueueItem } from "@/lib/reviews";
import { relTime } from "@/lib/format";
import { Avatar } from "./Avatar";

export function ReviewCard({ item }: { item: QueueItem }) {
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
        body: JSON.stringify({ reviewId: item.review.id, decision }),
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

  const minutesLeft = item.expiresInMs === null ? null : Math.max(1, Math.ceil(item.expiresInMs / 60_000));

  return (
    <article className={`rounded-2xl border bg-surface p-5 ${item.flagged ? "border-danger-line" : "border-line"}`}>
      <div className="flex items-start gap-3">
        <Avatar name={item.comment.author.display_name} handle={item.comment.author.handle} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{item.comment.author.display_name}</span>
            <span className="ml-2 text-muted">
              {item.flagged
                ? "sent automatically"
                : item.comment.category === "unsure"
                  ? `sent ${relTime(item.review.created_at)} ago because the AI wasn't sure what it means`
                  : `asked for review ${relTime(item.review.created_at)} ago`}
            </span>
          </p>
          {item.post && (
            <p className="mt-0.5 truncate text-[13px] text-muted">
              Replying to {item.post.author.display_name}: {item.post.body}
            </p>
          )}
          <p className="mt-2 text-[15px] leading-relaxed break-words">{item.comment.body}</p>
          {item.comment.reason && (
            <p className={`mt-2 text-sm leading-relaxed ${item.flagged ? "text-danger" : "text-warn"}`}>{item.comment.reason}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 pl-11">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve("uphold")}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Keep unposted
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void resolve("approve")}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:border-muted disabled:opacity-50"
        >
          Post it
        </button>
        {minutesLeft !== null && <span className="text-[13px] text-muted">{minutesLeft} min left, then it stays unposted</span>}
        {error && <span className="text-[13px] text-danger">{error}</span>}
      </div>
    </article>
  );
}
