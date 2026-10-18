// Server-side Realtime broadcast. RLS is on with zero anon policies, so browser
// clients can't subscribe to table changes — instead the server announces "the
// queue changed" on a public broadcast channel and pages refetch through our own
// (server-filtered) queries. Live without polling, nothing leaked.

export async function broadcastMod(): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: "mod", event: "queue", payload: { at: new Date().toISOString() } }],
      }),
    });
  } catch {
    // Best-effort: a missed broadcast means a stale page, never a wrong decision.
  }
}
