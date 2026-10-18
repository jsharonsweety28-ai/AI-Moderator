import type { CommentView } from "@/lib/feed";
import { relTime } from "@/lib/format";
import { Avatar } from "./Avatar";

export function CommentItem({ comment }: { comment: CommentView }) {
  const unposted = comment.state !== "posted";
  return (
    <div className="flex gap-3">
      <Avatar name={comment.author.display_name} handle={comment.author.handle} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{comment.author.display_name}</span>
          <span className="ml-2 text-muted">{relTime(comment.createdAt)}</span>
        </p>
        <p className={`mt-0.5 text-[15px] leading-relaxed break-words ${unposted ? "text-muted" : ""}`}>{comment.body}</p>
        {unposted && (
          <p className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-muted">
            {comment.state === "waiting" ? "Only you can see this. " : "Not posted. Only you can see this. "}
            {comment.reason}
          </p>
        )}
      </div>
    </div>
  );
}
