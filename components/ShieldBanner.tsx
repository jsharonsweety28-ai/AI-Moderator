"use client";

// The shield (CLAUDE.md): Summarize is the primary action — the one a distracted
// person taps. Show them exists, is never default, and is never styled as the
// obvious choice. Nothing nudges the target toward reading forty insults.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ShieldView } from "@/lib/feed";
import { relTime } from "@/lib/format";

export function ShieldBanner({ postId, shield }: { postId: string; shield: ShieldView }) {
  const router = useRouter();
  const [summary, setSummary] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false);

  async function summarize() {
    setBusy(true);
    try {
      const res = await fetch("/api/shield/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const out = (await res.json()) as { summary?: string };
      setSummary(out.summary ?? "Couldn't build a summary right now.");
    } catch {
      setSummary("Couldn't build a summary right now.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await fetch("/api/shield/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!shield.engaged) {
    return (
      <div className="mt-3 rounded-md border border-line bg-card px-3 py-2 font-mono text-xs text-graphite">
        Shield is off — {shield.hiddenCount} heated {shield.hiddenCount === 1 ? "reply is" : "replies are"} visible
        below.{" "}
        <button onClick={() => void toggle(true)} disabled={busy} className="underline underline-offset-2 hover:text-ink">
          turn shield on
        </button>
      </div>
    );
  }

  if (minimized) {
    return (
      <div className="mt-3 font-mono text-xs text-graphite">
        {shield.hiddenCount} replies hidden · shield on ·{" "}
        <button onClick={() => setMinimized(false)} className="underline underline-offset-2 hover:text-ink">
          open
        </button>
      </div>
    );
  }

  return (
    <div className="slip-in mt-3 rounded-md border border-moderator/25 bg-moderator-wash px-4 py-3">
      <p className="text-[15px] font-semibold">
        {shield.hiddenCount} {shield.hiddenCount === 1 ? "reply was" : "replies were"} hidden.
      </p>

      {summary && <p className="mt-2 font-mono text-xs leading-relaxed text-moderator">{summary}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void summarize()}
          disabled={busy}
          className="rounded-md bg-moderator px-4 py-2 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {summary ? "Summarize again" : "Summarize"}
        </button>
        <button
          onClick={() => setRevealed((r) => !r)}
          disabled={busy}
          className="px-2 py-2 font-mono text-xs text-graphite underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          {revealed ? "Hide them" : "Show them"}
        </button>
        <button
          onClick={() => setMinimized(true)}
          disabled={busy}
          className="px-2 py-2 font-mono text-xs text-graphite underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          Keep hidden
        </button>
      </div>

      {revealed && (
        <div className="mt-3 space-y-2 border-l-2 border-moderator/40 pl-3">
          <p className="font-mono text-[11px] text-graphite">
            Shown because you asked — useful for a report to your school, workplace, or the police.
          </p>
          {shield.hidden.map((c) => (
            <div key={c.id} className="py-1">
              <p className="text-sm">
                <span className="font-semibold">{c.author.display_name}</span>
                <span className="ml-1.5 font-mono text-[11px] text-graphite">
                  @{c.author.handle} · {relTime(c.createdAt)}
                </span>
              </p>
              <p className="mt-0.5 text-[15px] leading-relaxed text-graphite">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 font-mono text-[11px] text-graphite">
        auto-shield: on ·{" "}
        <button onClick={() => void toggle(false)} disabled={busy} className="underline underline-offset-2 hover:text-ink">
          turn off
        </button>
      </p>
    </div>
  );
}
