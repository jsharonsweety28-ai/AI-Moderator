"use client";

// The reply box and the moderator's answer. Rude: a reason and a better way to say
// it ([Use this] [Edit] [Ask a moderator]). Severe: an explanation, and the writer
// edits it themselves. If the check can't run, nothing is posted.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { inspectDraft } from "@/plugin/src/moderator.mjs";

type Answer =
  | { kind: "none" }
  | { kind: "rude"; commentId: string; original: string; reason: string; suggestion: string | null }
  | { kind: "severe"; commentId: string; reason: string }
  | { kind: "unavailable"; reason: string };

export function Composer({ postId }: { postId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<Answer>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const hint = text.trim() && answer.kind === "none" ? inspectDraft(text).message : null;

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
        setAnswer({ kind: "rude", commentId: out.commentId, original: body, reason: out.reason, suggestion: out.suggestion });
      } else if (out.status === "severe") {
        setAnswer({ kind: "severe", commentId: out.commentId, reason: out.reason });
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
              void post();
            }
          }}
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] leading-relaxed placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void post()}
          disabled={busy || !text.trim()}
          className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Post"}
        </button>
      </div>

      {hint && <p className="mt-2 text-[13px] text-muted">{hint}</p>}

      {answer.kind === "rude" && (
        <div className="reveal mt-3 rounded-xl border border-warn-line bg-warn-soft p-4">
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
