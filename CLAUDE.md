# CLAUDE.md

## What this is

A social media app where the AI does not just block rude comments — it offers the user a better way to say the same thing.

The one-line pitch: **every moderation system tells users what they can't say; none tells them what they could say instead.**

This is a hackathon project. Ship the moderation pipeline, not a social network.

---

## Stack

- **Next.js** (App Router, TypeScript) — one repo, API routes alongside the frontend
- **Supabase** — Postgres + Realtime. Realtime is load-bearing: the moderator dashboard must update live without polling.
- **NVIDIA Nemotron** via **Nebius Token Factory** (OpenAI-compatible API) — used for all text understanding (scoring, rewriting, context judgement). Required by the Nebius x NVIDIA hackathon; switched from MiniMax M3 on 2026-10-18
- **Tailwind** for styling
- Deploy on Vercel

---

## Non-negotiable rules

These are design invariants. Do not violate them for convenience, and flag it if a requested change would break one.

1. **Every comment is scored on its words first. Always.** No whitelist, no fast lane, no skipping the check for trusted users or friends. If knowing someone lets you bypass scoring, the whole system is defeated by "follow them first."

2. **Context can only make things stricter, never looser.** Relationship history, account age, and reputation may raise a score or tighten visibility. They may never lower a score below what the text itself earned.

3. **Friendship decides who sees a comment, never whether it is acceptable.** Two people can consent to rough talk between themselves. They cannot consent on behalf of everyone else reading a public thread.

4. **Humans handle the unclear, not the worst.** The extreme tier is auto-blocked and never queued — there is nothing to review. Human reviewers exist for the ambiguous middle.

5. **Nothing is ever hidden silently.** Any blocked, collapsed, or limited comment shows the author a plain-language reason and a path to challenge it.

6. **Fail closed.** If review times out, if the LLM errors, if a score can't be computed — the comment stays blocked and the user is told. Never default to publishing.

7. **The rewrite is offered, never forced.** `[Use this]`, `[Edit]`, and `[Request review]` must all be present. If the rewrite fails to generate, fall back to a plain warning — do not crash and do not auto-publish.

8. **Never make the target read the abuse.** When comments are hidden from someone, the default action is a summary, not the comments themselves. Reading them is possible but always secondary and never pre-selected.

---

## The comment pipeline

```
User types
   |
   v
AI #1 — score the text alone (0..1 + category + reason)
   |
   +-- clean   -> post publicly
   |
   +-- extreme -> hard block. No rewrite, no fast appeal.
   |              Slow "this was wrong" link into a separate low-priority queue.
   |
   +-- rude    -> block + offer rewrite
                    |
                    +-- accepts rewrite -> post publicly
                    +-- edits it        -> rescore from the top
                    +-- rejects it      -> AI #2
                                             |
                                             v
                              AI #2 — decides AUDIENCE, not permission
                                 - established mutual pair, mild -> recipient sees it,
                                                                    collapsed for everyone else
                                 - stranger or one-directional    -> collapsed for all
                                 - post tension is high           -> collapsed
                                 - unclear                        -> human review queue
```

Human review resolves in minutes. On timeout, the comment stays blocked and the author is notified.

**Thresholds** live in one config file, not scattered in code. Starting values (tune against the test set, do not ship guesses):

```ts
CLEAN_MAX = 0.40
EXTREME_MIN = 0.85
```

---

## What is an LLM job vs a code job

This split matters. Do not blur it.

| Question | Handled by |
|---|---|
| What does this text mean? | Nemotron (Token Factory) |
| How many, how fast, who with? | Postgres query |

**Nemotron handles every AI task in this project. There is no second model.** Specifically:

1. **AI #1** — scoring a comment for harmfulness
2. **The rewrite** — generating a non-abusive version of the same point
3. **AI #2** — judging audience given relationship context
4. **Similarity check** — are these N comments the same message reworded (one signal feeding the code-based pile-on detector)
5. **Shield summary** — describing hidden comments without quoting them

All five are prompts against the same model. Different prompts, one API.

**Code handles:** everything about counting, timing, grouping, and co-occurrence. Pile-on detection, bot coordination, and the freeze-out detector are all SQL. Do not ask an LLM to do arithmetic on timestamps.

### Prompt requirements

- Every scoring call returns strict JSON: `{ score, category, reason }`. The `reason` is shown to the user, so it must be plain language, not model-speak.
- Every rewrite prompt must include: **"Reply in the same language and script as the input."** Hindi in, English out kills the demo.
- Never send a comment to the LLM per keystroke. Score on typing pause (~500ms) or on send press.
- Cache demo-path responses. Venue wifi has ended more demos than bad code.

---

## Schema

```sql
users (
  id, handle, display_name, avatar_url,
  created_at            -- backdate these for seeded users
)

posts (
  id, author_id, body, created_at,
  tension               -- float, 0..1, decays over time
)

comments (
  id, post_id, author_id, body, created_at,
  score, category,      -- from AI #1
  visibility,           -- 'public' | 'recipient_only' | 'collapsed' | 'ghosted' | 'blocked'
  reason,               -- shown to the author
  rewrite_offered, rewrite_accepted
)

relationships (
  a_id, b_id,           -- directional: a -> b
  first_seen, msg_count,
  reciprocity,          -- min(a->b, b->a) / max(...)
  rough_baseline,       -- mean toxicity of a's messages to b
  negative_reactions    -- times b deleted/muted/blocked a
)

reviews (
  id, comment_id, reviewer_id,
  decision,             -- 'approve' | 'uphold'
  created_at, resolved_at
)

reports (
  id, comment_id, reporter_id, reason, created_at
)

blocks (
  blocker_id, blocked_id, kind, created_at   -- kind: 'block' | 'mute'
)

signals (                -- the feedback loop; append-only
  id, comment_id, kind, created_at
)                        -- kind: 'reviewer_approve' | 'reviewer_uphold'
                         --     | 'target_deleted' | 'target_muted'
                         --     | 'target_blocked' | 'reported'
```

**`relationships` is directional.** A→B and B→A are separate rows. One-directional traffic is the core bullying signal.

**`signals` is the training data.** Every reviewer decision and every target reaction gets appended. Never delete from it. This is what makes the system improve with zero annotation cost.

---

## Background jobs

**Fast — every minute.** Per-post pile-on check. A burst alone means nothing (popular posts spike too). Fire only when a burst *also* shows: mostly negative, mostly strangers or new accounts, high text similarity, and a cliff-shaped arrival curve. Raise `posts.tension`; decay it ~10% per minute.

**Slow — nightly.** Co-occurrence queries. Which accounts keep appearing together across posts (bot coordination). Which users have four or more one-directional, mildly-negative relationships pointing at them while their posting rate declines (freeze-out detection). Both are `GROUP BY` queries — no model involved.

---

## The shield (target-side)

When comments are hidden from a user — either because a pile-on was detected or because individual comments were collapsed — they see a single line:

```
18 replies were hidden.
[ Summarize ]   [ Show them ]   [ Keep hidden ]
```

**`Summarize` is the primary action.** It is the visually dominant button and the one a distracted person taps. It calls the model with the hidden comments and returns a short factual account — categories and counts, never the text itself:

> Mostly insults about your appearance. 3 contained threats. All from accounts you have not interacted with before.

**`Show them` is secondary.** Present, never default, never styled as the obvious choice. It exists because the user may legitimately need the content — for a report to their school, workplace, or the police — and because deciding on someone's behalf that they cannot see messages sent to them is not ours to make. But nothing should nudge them toward reading forty insults; the information value is exhausted after the first one and the rest is pure harm.

**Threats bypass the target entirely.** Any hidden comment scored `extreme` is forwarded to the moderator queue and preserved as evidence automatically, whether or not the target ever opens the shield. They should never have to read a threat in order for it to be acted on.

**The target controls the shield.** A per-user toggle decides whether it engages automatically during a detected pile-on. Default on, but theirs to turn off — the system protects by default and yields to the person's own judgement.

Summaries must never quote the hidden comments verbatim. Describe, count, categorise. Quoting defeats the entire purpose.

---

## Bots

**Do not claim bot detection.** A well-built single bot is indistinguishable from a human. Detect *coordination* instead — which accounts keep showing up together.

Three tiers:
- **Suspicious** — log only, nothing visible
- **Likely** — rate limit AND reduce reach (limit alone is a visible wall the operator tunes around; reduced reach leaks nothing)
- **Confirmed** — flag for human. **Only a human issues a permanent ban.**

Never treat "verified" as trustworthy — verification is purchasable. Account age alone is never a flag; every real user is new once.

---

## Build order

1. Rough classifier (a single model prompt is fine on day one) — everything depends on this existing
2. Feed + compose box
3. Visibility dial (collapse UI)
4. Nudge + rewrite
5. Moderator dashboard with Supabase Realtime
6. Report / block / mute
7. Pile-on detector + tension
8. Freeze-out detector (cut this first if time runs short)

**Time budget: 50% classifier and evaluation, 30% dashboard and review loop, 20% feed.** The classic failure is inverting this — a beautiful feed wired to a hardcoded threshold.

---

## Do NOT build

Profiles. Follows. DMs. Real auth (use a dev user-switcher). Image uploads. Notifications. Search. Infinite scroll.

Five seeded users on one feed is enough. Anything else is time stolen from the moderation pipeline.

---

## Seed data

Seed users with **backdated relationship history** — this is what makes the demo work. Without it, AI #2 has nothing to reason about.

Required seeded pairs:
- Two users with a long, mutual, mildly-rough history (banter that should stay visible to each other)
- One user who has been quietly cold toward another for weeks, one-directional (freeze-out case)
- Two fresh accounts with no history
- ~20 scripted accounts for the pile-on demo, created within the same window

---

## Conventions

- All moderation constants in `lib/config.ts`. No magic numbers in components.
- All model calls go through `lib/moderation/` (the client is `lib/moderation/llm.ts`) — never call the API directly from a component.
- Every function that changes a comment's visibility must also write the `reason`. Make it impossible to hide something without explaining it.
- Server-side scoring only. A client-side check is a client-side bypass.
- Log every LLM call's input and output during development — you will need these when tuning thresholds.
