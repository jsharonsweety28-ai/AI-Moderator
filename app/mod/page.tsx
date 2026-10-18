import Link from "next/link";
import { realtimeConfig } from "@/lib/db/server";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ReviewCard } from "@/components/ReviewCard";
import { getQueue } from "@/lib/reviews";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function ModPage() {
  const viewer = await getViewer().catch(() => null);
  const queue = viewer ? await getQueue() : null;
  const asked = queue?.filter((i) => !i.flagged) ?? [];
  const flagged = queue?.filter((i) => i.flagged) ?? [];

  return (
    <div className="mx-auto max-w-[620px] px-4 pb-24">
      <LiveRefresh config={realtimeConfig()} />
      <header className="py-8">
        <Link href="/" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Back to the feed
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Moderator queue</h1>
        <p className="text-sm text-muted">Comments waiting for a person to decide. Nothing here is posted until you say so.</p>
      </header>

      {queue === null ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">The queue couldn&apos;t load. Check the database connection and reload.</p>
      ) : (
        <main className="space-y-8">
          <section>
            <h2 className="text-base font-semibold">Needs a decision ({asked.length})</h2>
            <p className="text-sm text-muted">The writer asked for a review, or the AI couldn&apos;t read the language with confidence. Each one stays unposted if nobody answers in 10 minutes.</p>
            <div className="mt-3 space-y-3">
              {asked.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No one is waiting.</p>
              ) : (
                asked.map((item) => <ReviewCard key={item.review.id} item={item} />)
              )}
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold">Sent automatically ({flagged.length})</h2>
            <p className="text-sm text-muted">Threats, hate and other severe comments. The writer was told why; these are kept as evidence.</p>
            <div className="mt-3 space-y-3">
              {flagged.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Nothing severe right now.</p>
              ) : (
                flagged.map((item) => <ReviewCard key={item.review.id} item={item} />)
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
