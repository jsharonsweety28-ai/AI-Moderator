"use client";

// A run of consecutive collapsed replies rendered as ONE quiet line. Expanding
// is always available (nothing is hidden), never the default (the mob doesn't
// get an audience for free).
import { useState } from "react";
import type { CommentView } from "@/lib/feed";
import { CommentItem } from "./CommentItem";

export function CollapsedRun({
  items,
  viewerId,
  postAuthorId,
}: {
  items: CommentView[];
  viewerId?: string;
  postAuthorId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = items[0]?.tag ? ` — ${items[0].tag.toLowerCase()}` : "";

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="block w-full py-1.5 text-left font-mono text-xs text-graphite hover:text-ink focus:outline-2 focus:outline-offset-1 focus:outline-moderator"
      >
        · {items.length} replies collapsed{label} · view all
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(false)}
        className="block w-full py-1.5 text-left font-mono text-xs text-graphite hover:text-ink"
      >
        · collapse {items.length} replies again
      </button>
      {items.map((c) => (
        <CommentItem key={c.id} comment={c} viewerId={viewerId} postAuthorId={postAuthorId} defaultExpanded />
      ))}
    </div>
  );
}
