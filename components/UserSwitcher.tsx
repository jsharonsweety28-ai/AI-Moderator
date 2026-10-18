"use client";

// Dev user switcher (no real auth, by design): a two-person toggle.
import { useTransition } from "react";
import { switchUser } from "@/app/actions";
import type { UserRow } from "@/lib/db/types";
import { Avatar } from "./Avatar";

export function UserSwitcher({ users, currentId }: { users: UserRow[]; currentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label="Switch user" className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      {users.map((u) => {
        const active = u.id === currentId;
        return (
          <button
            key={u.id}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={() => !active && startTransition(() => switchUser(u.id))}
            className={`flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm transition-colors ${
              active ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            <Avatar name={u.display_name} handle={u.handle} size={24} />
            {u.display_name.split(" ")[0]}
          </button>
        );
      })}
    </div>
  );
}
