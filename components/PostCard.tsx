import type { CommentView, PostView } from "@/lib/feed";
import { relTime } from "@/lib/format";
import { CollapsedRun } from "./CollapsedRun";
import { CommentItem } from "./CommentItem";
import { Composer } from "./Composer";
import { ShieldBanner } from "./ShieldBanner";

/** Consecutive collapsed replies render as one line, not a wall of stubs. */
function groupComments(comments: CommentView[]): CommentView[][] {
  const groups: CommentView[][] = [];
  for (const c of comments) {
    const last = groups[groups.length - 1];
    if (c.state === "collapsed" && last && last[0].state === "collapsed") last.push(c);
    else groups.push([c]);
  }
  return groups;
}

export function PostCard({ post, viewerId }: { post: PostView; viewerId: string }) {
  return (
    <article className="rounded-lg border border-line bg-card px-4 py-4 sm:px-5">
      <header className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold">{post.author.display_name}</span>
        <span className="font-mono text-[11px] text-graphite">
          @{post.author.handle} · {relTime(post.createdAt)}
        </span>
      </header>
      <p className="mt-1.5 text-[16px] leading-relaxed">{post.body}</p>

      {post.shield && <ShieldBanner postId={post.id} shield={post.shield} />}

      {post.comments.length > 0 && (
        <div className="mt-3 space-y-0.5 border-l border-line pl-3.5">
          {groupComments(post.comments).map((group) =>
            group.length > 1 ? (
              <CollapsedRun key={group[0].id} items={group} viewerId={viewerId} postAuthorId={post.author.id} />
            ) : (
              <CommentItem key={group[0].id} comment={group[0]} viewerId={viewerId} postAuthorId={post.author.id} />
            )
          )}
        </div>
      )}

      <Composer postId={post.id} />
    </article>
  );
}
