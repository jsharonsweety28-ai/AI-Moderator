"use client";

import { useState } from "react";
import type { CommentView } from "@/lib/feed";
import { relTime } from "@/lib/format";
import { CommentActions } from "./CommentActions";
import { ModeratorActions, type ActionKind } from "./ModeratorActions";

export function CommentItem({
  comment,
  viewerId,
  postAuthorId,
  defaultExpanded = false,
}: {
  comment: CommentView;
  viewerId?: string;
  postAuthorId?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (comment.state === "collapsed" && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="block w-full py-1.5 text-left font-mono text-xs text-graphite hover:text-ink focus:outline-2 focus:outline-offset-1 focus:outline-moderator"
      >
        · 1 reply collapsed{comment.tag ? ` — ${comment.tag.toLowerCase()}` : ""} · view
      </button>
    );
  }

  const isHeld = comment.state === "own_blocked";
  const isSevere = isHeld && comment.tag === "Blocked";
  const isRemoved = isHeld && comment.tag === "Removed";
  const heldLabel = isSevere
    ? "Blocked — only you see this"
    : isRemoved
      ? "Removed by the post's author — only you see this"
      : "Held — only you see this";
  const showSocialActions =
    !isHeld && viewerId !== undefined && comment.author.id !== viewerId && (comment.state !== "collapsed" || expanded);

  return (
    <div
      className={
        isHeld
          ? `slip-in rounded-md border px-3 py-2.5 ${isSevere ? "border-danger/30 bg-danger-wash" : "border-moderator/25 bg-moderator-wash"}`
          : comment.state === "collapsed"
            ? "border-l-2 border-moderator/40 py-1.5 pl-3"
            : "py-1.5"
      }
    >
      {isHeld && (
        <p className={`mb-1.5 font-mono text-[11px] font-semibold tracking-wide uppercase ${isSevere ? "text-danger" : "text-moderator"}`}>
          {heldLabel}
        </p>
      )}

      <p className="text-sm leading-relaxed">
        <span className="font-semibold">{comment.author.display_name}</span>
        <span className="ml-1.5 font-mono text-[11px] text-graphite">
          @{comment.author.handle} · {relTime(comment.createdAt)}
        </span>
      </p>
      <p className={`mt-0.5 text-[15px] leading-relaxed ${isHeld ? "text-graphite" : ""}`}>{comment.body}</p>

      {comment.tag && !isHeld && (
        <p className="mt-1 font-mono text-[11px] text-moderator">{comment.tag}</p>
      )}
      {comment.reasonShown && (
        <p className={`mt-1.5 font-mono text-xs leading-relaxed ${isSevere ? "text-danger" : "text-moderator"}`}>
          {comment.reasonShown}
        </p>
      )}
      {comment.pendingReview && (
        <p className="mt-1.5 font-mono text-xs text-graphite italic">
          With a human reviewer — it stays hidden until they decide.
        </p>
      )}
      {comment.suggestion && (
        <p className="mt-2 border-l-2 border-moderator/40 pl-3 text-[15px] leading-relaxed">{comment.suggestion}</p>
      )}
      {comment.actions.length > 0 && (
        <div className="mt-2">
          <ModeratorActions commentId={comment.id} actions={comment.actions as ActionKind[]} />
        </div>
      )}
      {showSocialActions && (
        <CommentActions
          commentId={comment.id}
          authorId={comment.author.id}
          canRemove={viewerId === postAuthorId}
        />
      )}
    </div>
  );
}
