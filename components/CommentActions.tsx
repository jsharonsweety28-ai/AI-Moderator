"use client";

// The quiet row under other people's comments: report · mute · block (+ remove
// on your own post). Every one of these feeds the signals table.
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CommentActions({
  commentId,
  authorId,
  canRemove,
}: {
  commentId: string;
  authorId: string;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "report" | "mute" | "block" | "remove") {
    setBusy(true);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, commentId, userId: authorId }),
      });
      const out = (await res.json()) as { ok?: boolean; note?: string; error?: string };
      setNote(out.ok ? (out.note ?? "Done.") : (out.error ?? "That didn't work."));
      router.refresh();
    } catch {
      setNote("That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (note) return <p className="mt-0.5 font-mono text-[11px] text-moderator">{note}</p>;

  const cls = "hover:text-ink underline-offset-2 hover:underline disabled:opacity-50";
  return (
    <p className="mt-0.5 font-mono text-[11px] text-graphite/70">
      <button className={cls} disabled={busy} onClick={() => void act("report")}>
        report
      </button>
      {" · "}
      <button className={cls} disabled={busy} onClick={() => void act("mute")}>
        mute
      </button>
      {" · "}
      <button className={cls} disabled={busy} onClick={() => void act("block")}>
        block
      </button>
      {canRemove && (
        <>
          {" · "}
          <button className={cls} disabled={busy} onClick={() => void act("remove")}>
            remove
          </button>
        </>
      )}
    </p>
  );
}
