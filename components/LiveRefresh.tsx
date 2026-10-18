"use client";

// Subscribes to the server's broadcast channel and refetches on any queue event.
// Live without polling; all data still flows through server-filtered queries.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserDb } from "@/lib/db/client";

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const sb = browserDb();
    const channel = sb
      .channel("mod")
      .on("broadcast", { event: "queue" }, () => router.refresh())
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [router]);

  return null;
}
