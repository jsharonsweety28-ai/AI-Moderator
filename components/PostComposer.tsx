"use client";

// New post + the comfort dial: how much criticism does the author want to face?
// The dial only ever ADDS protection — "open" is exactly the normal pipeline.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CritPref } from "@/lib/config";

const OPTIONS: Array<{ value: CritPref; label: string; hint: string }> = [
  { value: "open", label: "Open", hint: "All comments, normal moderation." },
  { value: "no_personal", label: "No personal criticism", hint: "Comments aimed at you are collapsed and summarized for you." },
  { value: "no_criticism", label: "No criticism", hint: "Critical comments about you or the work are collapsed and summarized for you." },
];

export function PostComposer() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pref, setPref] = useState<CritPref>("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, critPref: pref }),
      });
      const out = (await res.json()) as { ok?: boolean; error?: string };
      if (out.ok) {
        setBody("");
        setPref("open");
        router.refresh();
      } else {
        setError(out.error ?? "Couldn't publish — try again.");
      }
    } catch {
      setError("Couldn't publish — try again.");
    } finally {
      setBusy(false);
    }
  }

  const selected = OPTIONS.find((o) => o.value === pref)!;

  return (
    <div className="mb-4 rounded-lg border border-line bg-card px-4 py-3 sm:px-5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Post something…"
        className="w-full resize-none rounded-md border border-line bg-card px-3 py-2 text-[15px] leading-relaxed placeholder:text-graphite/60 focus:outline-2 focus:outline-offset-1 focus:outline-moderator"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setPref(o.value)}
              title={o.hint}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                pref === o.value
                  ? "border-moderator bg-moderator-wash text-moderator"
                  : "border-line text-graphite hover:border-graphite"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void publish()}
          disabled={busy || !body.trim()}
          className="rounded-md bg-ink px-3.5 py-2 font-mono text-xs font-medium text-paper hover:opacity-90 disabled:opacity-40"
        >
          Publish
        </button>
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-graphite">{selected.hint}</p>
      {error && <p className="mt-1.5 font-mono text-xs text-danger">{error}</p>}
    </div>
  );
}
