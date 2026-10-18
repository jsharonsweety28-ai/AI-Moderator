-- AI Moderator schema (CLAUDE.md). Run in the Supabase SQL editor or via supabase db push.

create table users (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()  -- backdate for seeded users
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now(),
  tension real not null default 0 check (tension >= 0 and tension <= 1)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id),
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now(),
  score real,
  category text,
  -- default 'blocked' = fail closed: a comment is invisible until moderation says otherwise
  visibility text not null default 'blocked'
    check (visibility in ('public', 'recipient_only', 'collapsed', 'ghosted', 'blocked')),
  reason text,  -- every visibility change must also write this (CLAUDE.md convention)
  rewrite_offered boolean not null default false,
  rewrite_accepted boolean not null default false
);
create index comments_post_idx on comments (post_id, created_at);

-- Directional: A->B and B->A are separate rows. One-directional traffic is the core bullying signal.
create table relationships (
  a_id uuid not null references users(id),
  b_id uuid not null references users(id),
  first_seen timestamptz not null default now(),
  msg_count int not null default 0,
  reciprocity real not null default 0,        -- min(a->b, b->a) / max(...)
  rough_baseline real not null default 0,     -- mean toxicity of a's messages to b
  negative_reactions int not null default 0,  -- times b deleted/muted/blocked a
  primary key (a_id, b_id)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id),
  reviewer_id uuid references users(id),
  decision text check (decision in ('approve', 'uphold')),  -- null while pending
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reviews_pending_idx on reviews (created_at) where decision is null;

create table reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id),
  reporter_id uuid not null references users(id),
  reason text,
  created_at timestamptz not null default now()
);

create table blocks (
  blocker_id uuid not null references users(id),
  blocked_id uuid not null references users(id),
  kind text not null check (kind in ('block', 'mute')),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id, kind)
);

-- The feedback loop. Append-only: never update, never delete. This is free training data.
create table signals (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id),
  kind text not null check (kind in (
    'reviewer_approve', 'reviewer_uphold',
    'target_deleted', 'target_muted', 'target_blocked', 'reported'
  )),
  created_at timestamptz not null default now()
);
create index signals_comment_idx on signals (comment_id);

-- The moderator dashboard listens live on these (Supabase Realtime).
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table reviews;
alter publication supabase_realtime add table posts;
