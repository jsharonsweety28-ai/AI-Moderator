"use client";

// The reply box and the moderator's answer. Rude: a reason and a better way to say
// it ([Use this] [Edit] [Ask a moderator]). Severe: an explanation, and the writer
// edits it themselves. If the check can't run, nothing is posted.
//
// While typing, a badge checks the draft after each pause (one cheap verdict-only call,
// never the same text twice, capped per minute) and opens the card by itself when the
// draft is a problem. Post stays locked until a flagged draft is changed; the real check
// still runs on Post.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LIVE } from "@/lib/config";
import { inspectDraft } from "@/plugin/src/moderator.mjs";

type LiveVerdict = "clean" | "rude" | "severe" | "unsure";
type LiveResult = { verdict: LiveVerdict; reason: string; label: string | null };
// suggestion: undefined = still being made; null = none passed the checks
type Live = { key: string; result: LiveResult; suggestion?: string | null };

const normalize = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
const BADGE: Record<string, { cls: string; mark: string; title: string }> = {
  checking: { cls: "border-accent border-t-transparent animate-spin", mark: "", title: "Checking…" },
  clean: { cls: "border-[#12b76a] bg-[#ecfdf3] text-[#067647]", mark: "✓", title: "Looks good" },
  rude: { cls: "border-[#f79009] bg-warn-soft text-warn", mark: "!", title: "Could come across as rude" },
  severe: { cls: "border-[#d92d20] bg-danger-soft text-danger", mark: "!", title: "This can't be posted" },
  unsure: { cls: "border-[#7a5af8] bg-[#f4f3ff] text-[#5925dc]", mark: "!", title: "A moderator will check this when you post" },
};

type Answer =
  | { kind: "none" }
  | { kind: "rude"; commentId: string; original: string; reason: string; label: string | null; suggestion: string | null }
  | { kind: "severe"; commentId: string; reason: string; label: string | null }
  | { kind: "unavailable"; reason: string };

export function Composer({ postId }: { postId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<Answer>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const hint = text.trim() && answer.kind === "none" ? inspectDraft(text).message : null;

  // ---- live check while typing ----
  const [live, setLive] = useState<Live | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const cache = useRef(new Map<string, LiveResult>());
  const times = useRef<number[]>([]);
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text; // runs before the live-check effect below (effects run in order)
  }, [text]);
  const key = normalize(text);
  const current = live && live.key === key ? live : null; // the result for exactly this text
  const flagged = current?.result.verdict === "rude" || current?.result.verdict === "severe";

  useEffect(() => {
    if (key.length < LIVE.MIN_CHARS) return;
    const known = cache.current.get(key);
    if (known) {
      setLive((l) => (l && l.key === key ? l : { key, result: known }));
      return;
    }
    const timer = setTimeout(async () => {
      const now = Date.now();
      times.current = times.current.filter((t) => now - t < 60_000);
      if (times.current.length >= LIVE.PER_MINUTE) return; // over budget: the Post check still runs
      times.current.push(now);
      setChecking(true);
      try {
        const res = await fetch("/api/comments/peek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The exact text (not the normalized key), so the Post check reuses the server's answer.
          body: JSON.stringify({ text: latest.current.trim() }),
        });
        const out = await res.json();
        if (!res.ok || !out.verdict || out.verdict === "unavailable") return;
        const result: LiveResult = { verdict: out.verdict, reason: out.reason, label: out.label ?? null };
        cache.current.set(key, result);
        setLive({ key, result, suggestion: out.verdict === "rude" ? undefined : null });
        setChecking(false); // the verdict is in; the badge shows it while the suggestion is made
        if (out.verdict === "rude") {
          // The card opens by itself, so make the better way to say it right away.
          const s = await fetch("/api/comments/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: latest.current.trim(), postId }),
          })
            .then((r) => r.json())
            .catch(() => null);
          setLive((l) => (l && l.key === key ? { ...l, suggestion: s?.suggestion ?? null } : l));
        }
      } catch {
        // A failed live check is only a missing hint; the Post check still runs.
      } finally {
        setChecking(false);
      }
    }, LIVE.PAUSE_MS);
    return () => clearTimeout(timer);
  }, [key, postId]);

  const badge = key.length < LIVE.MIN_CHARS ? null : checking ? BADGE.checking : current ? BADGE[current.result.verdict] : null;
  const liveCard = current && current.result.verdict !== "clean" && dismissed !== key && answer.kind === "none" ? current : null;

  function takeSuggestion(suggestion: string) {
    setText(suggestion);
    setDismissed(null);
    input.current?.focus();
  }

  async function post(value = text) {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, text: body }),
      });
      const out = await res.json();
      if (out.status === "posted") {
        setText("");
        setAnswer({ kind: "none" });
        router.refresh();
      } else if (out.status === "rude") {
        setAnswer({ kind: "rude", commentId: out.commentId, original: body, reason: out.reason, label: out.label ?? null, suggestion: out.suggestion });
      } else if (out.status === "unsure") {
        // It now waits for a person; the thread shows it with that status.
        setText("");
        setAnswer({ kind: "none" });
        router.refresh();
      } else if (out.status === "severe") {
        setAnswer({ kind: "severe", commentId: out.commentId, reason: out.reason, label: out.label ?? null });
      } else {
        setAnswer({ kind: "unavailable", reason: out.reason ?? "We couldn't check this comment, so it hasn't been posted." });
      }
    } catch {
      setAnswer({ kind: "unavailable", reason: "We couldn't check this comment, so it hasn't been posted." });
    } finally {
      setBusy(false);
    }
  }

  async function act(commentId: string, action: "use_suggestion" | "ask_moderator") {
    setBusy(true);
    try {
      const res = await fetch("/api/comments/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, action }),
      });
      const out = await res.json();
      if (!out.ok) setAnswer({ kind: "unavailable", reason: out.reason ?? "That didn't work. Please try again." });
      else {
        setText("");
        // Posted comments appear in the thread; one waiting for a moderator appears there too, with its status.
        setAnswer({ kind: "none" });
        router.refresh();
      }
    } catch {
      setAnswer({ kind: "unavailable", reason: "That didn't work. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  function edit() {
    setAnswer({ kind: "none" });
    input.current?.focus();
  }

  return (
    <div>
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
        <textarea
          ref={input}
          value={text}
          rows={1}
          maxLength={2000}
          placeholder="Write a reply"
          aria-label="Write a reply"
          onChange={(e) => {
            setText(e.target.value);
            if (answer.kind !== "none") setAnswer({ kind: "none" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!flagged) void post();
            }
          }}
          className="min-h-11 w-full resize-none rounded-xl border border-line bg-canvas py-2.5 pr-10 pl-3.5 text-[15px] leading-relaxed placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none"
        />
          {badge && (
            <span
              role="img"
              aria-label={`Redraft: ${badge.title}`}
              title={badge.title}
              className={`absolute right-2.5 bottom-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${badge.cls}`}
            >
              {badge.mark}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void post()}
          disabled={busy || !text.trim() || flagged}
          title={flagged ? "Rewrite this comment before posting" : undefined}
          className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Post"}
        </button>
      </div>

      {hint && !current && <p className="mt-2 text-[13px] text-muted">{hint}</p>}

      {liveCard?.result.verdict === "rude" && (
        <div className="reveal mt-3 rounded-xl border border-warn-line bg-warn-soft p-4">
          {liveCard.result.label && (
            <span className="mb-1.5 inline-block rounded-full bg-warn-line px-2.5 py-0.5 text-xs font-semibold text-warn">{liveCard.result.label}</span>
          )}
          <p className="text-sm font-semibold text-warn">Could come across as rude</p>
          <p className="mt-1 text-sm leading-relaxed text-warn">{liveCard.result.reason}</p>
          <div className="mt-3 rounded-lg bg-surface p-3">
            <p className="text-[15px] leading-relaxed text-muted line-through decoration-muted/60">{text.trim()}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">
              {liveCard.suggestion === undefined ? (
                <span className="text-muted">Finding a better way to say it…</span>
              ) : liveCard.suggestion === null ? (
                <span className="text-muted">Try saying how you feel about the post, not the person.</span>
              ) : (
                <span className="redraft-mark">{liveCard.suggestion}</span>
              )}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {liveCard.suggestion && (
              <button
                type="button"
                onClick={() => takeSuggestion(liveCard.suggestion!)}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Use this
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDismissed(key);
                input.current?.focus();
              }}
              className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:border-muted"
            >
              Edit it myself
            </button>
          </div>
        </div>
      )}

      {liveCard?.result.verdict === "severe" && (
        <div className="reveal mt-3 rounded-xl border border-danger-line bg-danger-soft p-4">
          {liveCard.result.label && (
            <span className="mb-1.5 inline-block rounded-full bg-danger-line px-2.5 py-0.5 text-xs font-semibold text-danger">{liveCard.result.label}</span>
          )}
          <p className="text-sm font-semibold text-danger">This can&apos;t be posted</p>
          <p className="mt-1 text-sm leading-relaxed text-danger">{liveCard.result.reason}</p>
          <button
            type="button"
            onClick={() => {
              setDismissed(key);
              input.current?.focus();
            }}
            className="mt-3 rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Edit my comment
          </button>
        </div>
      )}

      {liveCard?.result.verdict === "unsure" && (
        <p className="reveal mt-2 rounded-lg bg-[#f4f3ff] px-3 py-2 text-[13px] text-[#5925dc]">
          We can&apos;t read this one confidently. When you post, a moderator will check it first.
        </p>
      )}

      {flagged && dismissed === key && (
        <p className="mt-2 text-[13px] text-muted">Post stays locked until you change this comment.</p>
      )}

      {answer.kind === "rude" && (
        <div className="reveal mt-3 rounded-xl border border-warn-line bg-warn-soft p-4">
          {answer.label && (
            <span className="mb-1.5 inline-block rounded-full bg-warn-line px-2.5 py-0.5 text-xs font-semibold text-warn">{answer.label}</span>
          )}
          <p className="text-sm font-semibold text-warn">Not posted yet</p>
          <p className="mt-1 text-sm leading-relaxed text-warn">{answer.reason}</p>
          {answer.suggestion ? (
            <div className="mt-3 rounded-lg bg-surface p-3">
              <p className="text-[15px] leading-relaxed text-muted line-through decoration-muted/60">{answer.original}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed">
                <span className="redraft-mark">{answer.suggestion}</span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-warn">Try saying how you feel about the post, not the person.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {answer.suggestion && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(answer.commentId, "use_suggestion")}
                className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Use this
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={edit}
              className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:border-muted disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(answer.commentId, "ask_moderator")}
              className="px-2 py-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              Ask a moderator
            </button>
          </div>
        </div>
      )}

      {answer.kind === "severe" && (
        <div className="reveal mt-3 rounded-xl border border-danger-line bg-danger-soft p-4">
          {answer.label && (
            <span className="mb-1.5 inline-block rounded-full bg-danger-line px-2.5 py-0.5 text-xs font-semibold text-danger">{answer.label}</span>
          )}
          <p className="text-sm font-semibold text-danger">This can&apos;t be posted</p>
          <p className="mt-1 text-sm leading-relaxed text-danger">{answer.reason}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={edit}
              className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Edit my comment
            </button>
            <span className="text-[13px] text-danger/80">Moderators can see this comment.</span>
          </div>
        </div>
      )}

      {answer.kind === "unavailable" && (
        <div className="reveal mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3">
          <p className="text-sm text-muted">{answer.reason}</p>
          <button type="button" onClick={() => void post()} className="text-sm font-semibold text-accent hover:underline">
            Try again
          </button>
        </div>
      )}

    </div>
  );
}
