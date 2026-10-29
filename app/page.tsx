import Link from "next/link";
import { realtimeConfig } from "@/lib/db/server";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PostCard } from "@/components/PostCard";
import { UserSwitcher } from "@/components/UserSwitcher";
import { getFeed, getUsers } from "@/lib/feed";
import { expireStaleReviews } from "@/lib/reviews";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer().catch(() => null);
  // No background job: review deadlines are enforced whenever someone looks.
  if (viewer) await expireStaleReviews().catch(() => {});
  const users = viewer ? ((await getUsers()) ?? []) : [];
  const feed = viewer ? await getFeed(viewer.id) : null;

  return (
    <div className="mx-auto max-w-[620px] px-4 pb-24">
      <LiveRefresh config={realtimeConfig()} />
      <header className="flex flex-wrap items-center justify-between gap-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Argus</h1>
          <p className="text-sm text-muted">Rude replies get a better way to say it, not just a block.</p>
        </div>
        {viewer && users.length > 0 && <UserSwitcher users={users} currentId={viewer.id} />}
      </header>

      {!viewer || !feed ? (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="font-semibold">The database isn&apos;t set up yet.</p>
          <p className="mt-1 text-sm text-muted">
            Run the files in <code>supabase/migrations</code> in the Supabase SQL editor, then <code>npm run seed</code>, and reload.
          </p>
        </div>
      ) : (
        <main className="space-y-5">
          {feed.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </main>
      )}

      <footer className="mt-10 text-center text-sm text-muted">
        <Link href="/mod" className="underline-offset-4 hover:text-ink hover:underline">
          Open the moderator queue
        </Link>
      </footer>
    </div>
  );
}
