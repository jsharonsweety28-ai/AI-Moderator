// Starts the fast background job (per-minute pile-on sweep + tension decay) in
// the server process. On Vercel, wire /api/jobs/pileon to a cron instead.
export async function register() {
  // Serverless has no long-lived process — on Vercel the sweep runs via cron or
  // the demo driver instead of an interval.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const g = globalThis as typeof globalThis & { __pileonTimer?: ReturnType<typeof setInterval> };
  if (g.__pileonTimer) return;
  const { runPileonSweep } = await import("@/lib/moderation/pileon");
  g.__pileonTimer = setInterval(() => {
    runPileonSweep().catch(() => {
      // A failed sweep is a missed minute, never a crash.
    });
  }, 60_000);
}
