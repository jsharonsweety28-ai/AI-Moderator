-- Clears the Supabase advisor findings.
--
-- RLS on, zero public policies: the auto-generated REST API locks shut for the
-- publishable key. The app is unaffected — every query goes through the Next.js
-- server with the service-role key, which bypasses RLS by design.
-- (Note for step 5: with RLS on, browser Realtime table subscriptions deliver
-- nothing to the publishable key — the dashboard will use broadcast channels.)
alter table users enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table relationships enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;
alter table signals enable row level security;

-- Index the foreign-key columns the performance advisor flagged.
create index if not exists comments_author_idx on comments (author_id);
create index if not exists posts_author_idx on posts (author_id);
create index if not exists relationships_b_idx on relationships (b_id);
create index if not exists reviews_comment_fk_idx on reviews (comment_id);
create index if not exists reviews_reviewer_idx on reviews (reviewer_id);
create index if not exists reports_comment_idx on reports (comment_id);
create index if not exists reports_reporter_idx on reports (reporter_id);
create index if not exists blocks_blocked_idx on blocks (blocked_id);
