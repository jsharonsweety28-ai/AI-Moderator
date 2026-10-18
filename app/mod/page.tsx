import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ReviewCard, type ReviewCardData } from "@/components/ReviewCard";
import { getNightlyInsights } from "@/lib/moderation/insights";
import { getModQueue, type QueueItem } from "@/lib/moderation/queue";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

function toCard(item: QueueItem, lane: ReviewCardData["lane"]): ReviewCardData {
  return {
    reviewId: item.review.id,
    lane,
    reportCount: item.reportCount,
    body: item.comment.body,
    authorName: item.comment.author.display_name,
    authorHandle: item.comment.author.handle,
    postAuthor: item.post?.author.display_name ?? null,
    postExcerpt: item.post ? item.post.body.slice(0, 60) + (item.post.body.length > 60 ? "…" : "") : null,
    score: item.comment.score,
    category: item.comment.category,
    reason: item.comment.reason,
    createdAt: item.review.created_at,
    expiresInMs: item.expiresInMs,
  };
}

export default async function ModPage() {
  const viewer = await getViewer().catch(() => null);
  const queue = viewer ? await getModQueue() : null;
  const insights = viewer ? await getNightlyInsights() : null;

  return (
    <div className="mx-auto max-w-[680px] px-4 pb-24">
      <LiveRefresh />
      <header className="flex items-baseline justify-between py-5">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight text-moderator">
            <Link href="/">redraft ¶</Link> <span className="text-ink">/ moderator</span>
          </h1>
          <p className="text-[13px] text-graphite italic">humans handle the unclear, not the worst</p>
        </div>
        {viewer && <span className="font-mono text-xs text-graphite">reviewing as @{viewer.handle}</span>}
      </header>

      {!viewer || queue === null ? (
        <div className="rounded-lg border border-line bg-card px-5 py-6">
          <p className="text-[15px] leading-relaxed">
            Database not ready — run the migration and <span className="font-mono text-[13px]">npm run seed</span> first.
          </p>
        </div>
      ) : (
        <main className="space-y-8">
          <section>
            <h2 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Review queue · {queue.main.length}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-graphite">
              The ambiguous middle. Each times out in minutes — on timeout the comment stays hidden and the author is told.
            </p>
            <div className="mt-3 space-y-3">
              {queue.main.length === 0 ? (
                <p className="rounded-md border border-line bg-card px-4 py-4 font-mono text-xs text-graphite">
                  Nothing waiting. The middle is quiet.
                </p>
              ) : (
                queue.main.map((item) => <ReviewCard key={item.review.id} item={toCard(item, "main")} />)
              )}
            </div>
          </section>

          <section>
            <h2 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Reported · {queue.reports.length}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-graphite">
              Comments people flagged after they were up. They stay up while they wait — a report alone never
              hides anything. Hide takes it down with a reason the commenter can read.
            </p>
            <div className="mt-3 space-y-3">
              {queue.reports.length === 0 ? (
                <p className="rounded-md border border-line bg-card px-4 py-4 font-mono text-xs text-graphite">
                  No open reports.
                </p>
              ) : (
                queue.reports.map((item) => <ReviewCard key={item.review.id} item={toCard(item, "report")} />)
              )}
            </div>
          </section>

          <section>
            <h2 className="font-mono text-xs font-semibold tracking-wide text-danger uppercase">
              Severe tier — threats &amp; appeals · {queue.appeals.length}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-graphite">
              Auto-blocked, never fast-tracked. Threats caught during a pile-on are forwarded here as evidence;
              author appeals crawl in the slow lane. No deadline.
            </p>
            <div className="mt-3 space-y-3">
              {queue.appeals.length === 0 ? (
                <p className="rounded-md border border-line bg-card px-4 py-4 font-mono text-xs text-graphite">
                  No appeals.
                </p>
              ) : (
                queue.appeals.map((item) => <ReviewCard key={item.review.id} item={toCard(item, "appeal")} />)
              )}
            </div>
          </section>

          <section>
            <h2 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">Pattern watch</h2>
            <p className="mt-1 font-mono text-[11px] text-graphite">
              The nightly queries — counting and grouping, no model. Freeze-out: many cold one-directional ties
              converging on one person as their posting declines. Co-occurrence: accounts that keep appearing
              together. Log-only — nothing is enforced from here.
            </p>
            <div className="mt-3 space-y-3">
              {!insights ? (
                <p className="rounded-md border border-line bg-card px-4 py-4 font-mono text-xs text-graphite">
                  Couldn&apos;t compute patterns right now.
                </p>
              ) : (
                <>
                  {insights.freezeouts.length === 0 ? (
                    <p className="rounded-md border border-line bg-card px-4 py-4 font-mono text-xs text-graphite">
                      No freeze-out patterns.
                    </p>
                  ) : (
                    insights.freezeouts.map((f) => (
                      <div key={f.handle} className="rounded-md border border-moderator/25 bg-moderator-wash px-4 py-3">
                        <p className="font-mono text-[11px] font-semibold tracking-wide text-moderator uppercase">
                          Freeze-out pattern
                        </p>
                        <p className="mt-1.5 text-[15px] leading-relaxed">
                          <span className="font-semibold">{f.displayName}</span>
                          <span className="ml-1.5 font-mono text-[11px] text-graphite">@{f.handle}</span>
                        </p>
                        <p className="mt-1 font-mono text-xs leading-relaxed text-moderator">
                          {f.coldCount} one-directional, mildly negative relationships point at them (
                          {f.coldFrom.map((h) => `@${h}`).join(", ")}). Posting rate: {f.priorPosts} posts two
                          weeks ago, {f.recentPosts} since. No single message crossed a line — the pattern did.
                        </p>
                      </div>
                    ))
                  )}
                  {insights.cooccurrence.length === 0 ? (
                    <p className="rounded-md border border-line bg-card px-4 py-4 font-mono text-xs text-graphite">
                      No coordinated commenting patterns.
                    </p>
                  ) : (
                    <div className="rounded-md border border-line bg-card px-4 py-3">
                      <p className="font-mono text-[11px] font-semibold tracking-wide text-ink uppercase">
                        Accounts that keep appearing together
                      </p>
                      {insights.cooccurrence.map((p) => (
                        <p key={`${p.a}|${p.b}`} className="mt-1.5 font-mono text-xs text-graphite">
                          @{p.a} + @{p.b} — together on {p.sharedPosts} posts
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
