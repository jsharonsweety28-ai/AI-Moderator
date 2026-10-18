import Link from "next/link";
import { cookies } from "next/headers";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PostCard } from "@/components/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { UserSwitcher } from "@/components/UserSwitcher";
import { getFeed, getUsers } from "@/lib/feed";
import { expireStaleReviews } from "@/lib/moderation/queue";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer().catch(() => null);
  const users = viewer ? ((await getUsers()) ?? []) : [];
  const store = await cookies();
  const shieldOff = viewer ? store.get(`shield_off_${viewer.id}`)?.value === "1" : false;
  // On Vercel there is no per-minute sweep, so the feed itself enforces review
  // deadlines — an author is told about a timeout the next time they look.
  if (viewer) await expireStaleReviews().catch(() => 0);
  const feed = viewer ? await getFeed(viewer.id, { shieldOff }) : null;

  return (
    <div className="mx-auto max-w-[680px] px-4 pb-24">
      <LiveRefresh />
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight text-moderator">redraft ¶</h1>
          <p className="text-[13px] text-graphite italic">says what you could say instead</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/mod" className="font-mono text-xs text-graphite underline underline-offset-2 hover:text-ink">
            moderator
          </Link>
          {viewer && users.length > 0 && <UserSwitcher users={users} currentId={viewer.id} />}
        </div>
      </header>

      {!viewer || feed === null ? (
        <div className="rounded-lg border border-line bg-card px-5 py-6">
          <p className="font-mono text-xs font-semibold tracking-wide text-moderator uppercase">Database not ready</p>
          <p className="mt-2 text-[15px] leading-relaxed">
            The Supabase schema hasn&apos;t been created yet (or there are no users).
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 font-mono text-xs leading-relaxed text-graphite">
            <li>Open the Supabase dashboard → SQL Editor</li>
            <li>
              Paste and run <span className="text-ink">supabase/migrations/00001_init.sql</span>
            </li>
            <li>
              Then run <span className="text-ink">npm run seed</span> and reload this page
            </li>
          </ol>
        </div>
      ) : feed.length === 0 ? (
        <div className="rounded-lg border border-line bg-card px-5 py-6">
          <p className="text-[15px] leading-relaxed">
            No posts yet. Run <span className="font-mono text-[13px]">npm run seed</span> to bring in the cast.
          </p>
        </div>
      ) : (
        <main className="space-y-4">
          <PostComposer />
          {feed.map((post) => (
            <PostCard key={post.id} post={post} viewerId={viewer.id} />
          ))}
        </main>
      )}
    </div>
  );
}
