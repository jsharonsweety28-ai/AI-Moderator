import type { PostView } from "@/lib/feed";
import { relTime } from "@/lib/format";
import { Avatar } from "./Avatar";
import { CommentItem } from "./CommentItem";
import { Composer } from "./Composer";

export function PostCard({ post }: { post: PostView }) {
  return (
    <article className="rounded-2xl border border-line bg-surface">
      <div className="flex gap-3 px-5 pt-5">
        <Avatar name={post.author.display_name} handle={post.author.handle} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{post.author.display_name}</span>
            <span className="ml-2 text-muted">{relTime(post.createdAt)}</span>
          </p>
          <p className="mt-1 text-[17px] leading-relaxed break-words">{post.body}</p>
        </div>
      </div>

      {post.comments.length > 0 && (
        <div className="mt-4 space-y-4 border-t border-line px-5 pt-4">
          {post.comments.map((c) => (
            <CommentItem key={c.id} comment={c} />
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line px-5 py-4">
        <Composer postId={post.id} />
      </div>
    </article>
  );
}
