-- Comments checked by the browser extension on other sites (YouTube, Reddit).
-- We never post these ourselves: the extension blocks the site's Post button until
-- the text is allowed. A comment the AI can't read with confidence waits here for a
-- moderator; severe ones are kept here as evidence.
create table if not exists ext_checks (
  id uuid primary key default gen_random_uuid(),
  site text not null,                 -- 'youtube' | 'reddit' | ...
  body text not null,
  verdict text not null check (verdict in ('clean', 'rude', 'severe', 'unsure')),
  score real,
  category text,
  reason text,                        -- shown to the writer
  suggestion text,                    -- the checked rewrite, for rude comments
  -- null = nothing for a moderator to do. 'pending' = waiting for a person.
  -- 'flagged' = severe, kept as evidence (the writer must rewrite it anyway).
  review_status text check (review_status in ('pending', 'approved', 'rejected', 'expired', 'flagged', 'seen')),
  reviewer_id uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ext_checks_open_idx on ext_checks (created_at) where review_status in ('pending', 'flagged');

-- Same policy as every other table: RLS on, no public policies; only the server touches it.
alter table ext_checks enable row level security;
