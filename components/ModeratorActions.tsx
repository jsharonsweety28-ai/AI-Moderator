"use client";

// The author's actions on a held comment. Shared by the composer nudge card and
// blocked comments rendered in the thread after a refresh.
import { useRouter } from "next/navigation";
import { useState } from "react";

export type ActionKind = "accept_rewrite" | "request_review" | "appeal";

const LABELS: Record<ActionKind, string> = {
  accept_rewrite: "Use this",
  request_review: "Request review",
  appeal: "This was wrong — request review",
};

export function ModeratorActions({
  commentId,
  actions,
  onDone,
}: {
  commentId: string;
  actions: ActionKind[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run(action: ActionKind) {
    setBusy(true);
    try {
      const res = await fetch("/api/comments/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, action }),
      });
      const out = (await res.json()) as { status: string; reason?: string };
      if (out.status === "posted") {
        setResult("Posted.");
        onDone?.();
      } else if (out.status === "recipient_only" || out.status === "collapsed" || out.status === "review") {
        setResult(out.reason ?? "Done.");
        onDone?.();
      } else {
        setResult(out.reason ?? "That didn't work — try again.");
      }
      router.refresh();
    } catch {
      setResult("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <p className="font-mono text-xs leading-relaxed text-moderator">{result}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) =>
        a === "appeal" ? (
          <button
            key={a}
            onClick={() => run(a)}
            disabled={busy}
            className="font-mono text-xs text-graphite underline underline-offset-2 hover:text-ink disabled:opacity-50"
          >
            {LABELS[a]}
          </button>
        ) : (
          <button
            key={a}
            onClick={() => run(a)}
            disabled={busy}
            className={
              a === "accept_rewrite"
                ? "rounded-md bg-moderator px-3 py-1.5 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                : "rounded-md border border-line bg-card px-3 py-1.5 font-mono text-xs text-ink hover:border-graphite disabled:opacity-50"
            }
          >
            {LABELS[a]}
          </button>
        )
      )}
      {busy && <span className="font-mono text-xs text-graphite">…</span>}
    </div>
  );
}
