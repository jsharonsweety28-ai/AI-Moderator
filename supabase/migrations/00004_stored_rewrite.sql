-- The rewrite the author was actually shown. [Use this] posts exactly this text
-- instead of regenerating it — regeneration only replayed identically when the
-- disk cache was writable, which it isn't on Vercel.
alter table comments
  add column if not exists rewrite_text text,
  add column if not exists rewrite_score real,
  add column if not exists rewrite_category text;
