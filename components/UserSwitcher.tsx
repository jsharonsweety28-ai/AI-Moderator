"use client";

import { useTransition } from "react";
import { switchUser } from "@/app/actions";
import type { UserRow } from "@/lib/db/types";

export function UserSwitcher({ users, currentId }: { users: UserRow[]; currentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 font-mono text-xs text-graphite">
      viewing as
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) => startTransition(() => switchUser(e.target.value))}
        className="rounded-md border border-line bg-card px-2 py-1 font-mono text-xs text-ink focus:outline-2 focus:outline-offset-1 focus:outline-moderator"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            @{u.handle}
          </option>
        ))}
      </select>
    </label>
  );
}
