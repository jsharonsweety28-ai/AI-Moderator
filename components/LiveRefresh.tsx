"use client";

// Subscribes to the server's broadcast channel and refetches on any queue event.
// Live without polling; all data still flows through server-filtered queries.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserDb } from "@/lib/db/client";

export function LiveRefresh({ config }: { config: { url: string; anonKey: string } | null }) {
  const router = useRouter();

  const url = config?.url;
  const anonKey = config?.anonKey;

  useEffect(() => {
    if (!url || !anonKey) return; // no Realtime settings: the page still works, it just doesn't auto-refresh
    const sb = browserDb(url, anonKey);
    const channel = sb
      .channel("mod")
      .on("broadcast", { event: "queue" }, () => router.refresh())
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [url, anonKey, router]);

  return null;
}
