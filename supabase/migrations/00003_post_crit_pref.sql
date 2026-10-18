-- Per-post comfort dial, chosen at posting time. 'open' = today's behavior;
-- the other two levels only ever ADD protection (context tightens, never loosens).
alter table posts add column crit_pref text not null default 'open'
  check (crit_pref in ('open', 'no_personal', 'no_criticism'));
