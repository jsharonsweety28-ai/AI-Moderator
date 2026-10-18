"use client";

// The compose box and the nudge flow. The three offers on a held comment are
// always all present: [Use this] [Edit] [Request review]. (CLAUDE.md invariant 7)
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "nudge"; commentId: string; reason: string; rewrite: string | null; noRewriteWhy?: string }
  | { kind: "extreme"; commentId: string; reason: string; appealed: boolean }
  | { kind: "tone"; original: string; polish: string }
  | { kind: "failed"; reason: string }
  | { kind: "note"; text: string };

export function Composer({ postId }: { postId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const original = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit(overrideText?: string, postAsWritten?: boolean) {
    const value = (overrideText ?? text).trim();
    if (!value || busy) return;
    original.current = value;
    setBusy(true);
    setPhase({ kind: "checking" });
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, text: value, postAsWritten: postAsWritten === true }),
      });
      const out = (await res.json()) as {
        status: string;
        commentId?: string;
        reason?: string;
        rewrite?: string | null;
        noRewriteWhy?: string;
        original?: string;
        polish?: string;
      };
      if (out.status === "posted") {
        setText("");
        setPhase({ kind: "idle" });
        router.refresh();
      } else if (out.status === "tone_offer" && typeof out.original === "string" && typeof out.polish === "string") {
        setPhase({ kind: "tone", original: out.original, polish: out.polish });
      } else if (out.status === "nudge" && out.commentId) {
        setPhase({
          kind: "nudge",
          commentId: out.commentId,
          reason: out.reason ?? "",
          rewrite: out.rewrite ?? null,
          noRewriteWhy: out.noRewriteWhy,
        });
      } else if (out.status === "blocked_extreme" && out.commentId) {
        setPhase({ kind: "extreme", commentId: out.commentId, reason: out.reason ?? "", appealed: false });
      } else {
        setPhase({ kind: "failed", reason: out.reason ?? "We couldn't check this comment. It hasn't been posted." });
      }
    } catch {
      setPhase({ kind: "failed", reason: "We couldn't check this comment. It hasn't been posted." });
    } finally {
      setBusy(false);
    }
  }

  async function act(commentId: string, action: "accept_rewrite" | "request_review" | "appeal") {
    setBusy(true);
    try {
      const res = await fetch("/api/comments/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, action }),
      });
      const out = (await res.json()) as { status: string; reason?: string };
      if (out.status === "posted") {
        setText("");
        setPhase({ kind: "idle" });
      } else if (action === "appeal") {
        setPhase((p) => (p.kind === "extreme" ? { ...p, appealed: true } : p));
        setText("");
      } else if (out.status === "recipient_only" || out.status === "collapsed" || out.status === "review") {
        setText("");
        setPhase({ kind: "note", text: out.reason ?? "Done." });
      } else {
        setPhase({ kind: "failed", reason: out.reason ?? "That didn't work — try again." });
      }
      router.refresh();
    } catch {
      setPhase({ kind: "failed", reason: "That didn't work — try again." });
    } finally {
      setBusy(false);
    }
  }

  function editRewrite(rewrite: string | null) {
    setText(rewrite ?? original.current);
    setPhase({ kind: "idle" });
    inputRef.current?.focus();
  }

  return (
    <div className="mt-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder="Write a reply…"
          className="min-h-[38px] flex-1 resize-none rounded-md border border-line bg-card px-3 py-2 text-[15px] leading-relaxed placeholder:text-graphite/60 focus:outline-2 focus:outline-offset-1 focus:outline-moderator"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          className="rounded-md bg-ink px-3.5 py-2 font-mono text-xs font-medium text-paper hover:opacity-90 disabled:opacity-40"
        >
          Post
        </button>
      </div>

      {phase.kind === "checking" && (
        <p className="mt-2 font-mono text-xs text-graphite">checking…</p>
      )}

      {phase.kind === "tone" && (
        <div className="slip-in mt-2 rounded-md border border-line bg-card px-3 py-3">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-moderator uppercase">
            Posts as written — no rules broken
          </p>
          <p className="mt-1.5 font-mono text-xs leading-relaxed text-graphite">
            Want it without the edge?
          </p>
          <blockquote className="mt-2 border-l-2 border-moderator/50 pl-3 text-[15px] leading-relaxed">
            {phase.polish}
          </blockquote>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void submit(phase.polish)}
              disabled={busy}
              className="rounded-md bg-moderator px-3 py-1.5 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Post this instead
            </button>
            <button
              onClick={() => void submit(phase.original, true)}
              disabled={busy}
              className="rounded-md bg-ink px-3 py-1.5 font-mono text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
            >
              Post as written
            </button>
          </div>
        </div>
      )}

      {phase.kind === "nudge" && (
        <div className="slip-in mt-2 rounded-md border border-moderator/25 bg-moderator-wash px-3 py-3">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-moderator uppercase">
            Held — here&apos;s another way to say it
          </p>
          <p className="mt-1.5 font-mono text-xs leading-relaxed text-moderator">{phase.reason}</p>
          {phase.rewrite ? (
            <blockquote className="mt-2 border-l-2 border-moderator/50 pl-3 text-[15px] leading-relaxed">
              {phase.rewrite}
            </blockquote>
          ) : phase.noRewriteWhy === "irreducible" ? (
            <p className="mt-2 font-mono text-xs text-graphite">
              There&apos;s no kinder version of this — the message itself is the dislike. Edit it to say
              what&apos;s actually on your mind, or ask for an audience review.
            </p>
          ) : phase.noRewriteWhy === "unfit" ? (
            <p className="mt-2 font-mono text-xs text-graphite">
              We couldn&apos;t find a version that keeps your point and stays civil. Edit it to say
              what&apos;s actually on your mind, or ask for an audience review.
            </p>
          ) : (
            <p className="mt-2 font-mono text-xs text-graphite">
              No suggestion available right now — you can edit your comment, or ask for an audience review.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {phase.rewrite && (
              <button
                onClick={() => void act(phase.commentId, "accept_rewrite")}
                disabled={busy}
                className="rounded-md bg-moderator px-3 py-1.5 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Use this
              </button>
            )}
            <button
              onClick={() => editRewrite(phase.rewrite)}
              disabled={busy}
              className="rounded-md border border-line bg-card px-3 py-1.5 font-mono text-xs text-ink hover:border-graphite disabled:opacity-50"
            >
              Edit
            </button>
            <button
              onClick={() => void act(phase.commentId, "request_review")}
              disabled={busy}
              className="rounded-md border border-line bg-card px-3 py-1.5 font-mono text-xs text-ink hover:border-graphite disabled:opacity-50"
            >
              Request review
            </button>
          </div>
        </div>
      )}

      {phase.kind === "extreme" && (
        <div className="slip-in mt-2 rounded-md border border-danger/30 bg-danger-wash px-3 py-3">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-danger uppercase">
            Blocked — this can&apos;t be posted
          </p>
          <p className="mt-1.5 font-mono text-xs leading-relaxed text-danger">{phase.reason}</p>
          {phase.appealed ? (
            <p className="mt-2 font-mono text-xs text-graphite">
              Appeal filed. Severe blocks are reviewed slowly; the comment stays hidden meanwhile.
            </p>
          ) : (
            <button
              onClick={() => void act(phase.commentId, "appeal")}
              disabled={busy}
              className="mt-2 font-mono text-xs text-graphite underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              This was wrong — request review
            </button>
          )}
        </div>
      )}

      {phase.kind === "failed" && (
        <p className="mt-2 font-mono text-xs leading-relaxed text-danger">{phase.reason}</p>
      )}

      {phase.kind === "note" && (
        <p className="slip-in mt-2 font-mono text-xs leading-relaxed text-moderator">{phase.text}</p>
      )}
    </div>
  );
}
