# CLAUDE.md

## What this is

A comment moderator, packaged as a drop-in plugin, that does not just block rude comments — it offers the writer a better way to say the same thing, and when a comment is genuinely harmful it explains why instead of silently refusing it.

The one-line pitch: **every moderation system tells users what they can't say; none tells them what they could say instead.**

Built for the Nebius x NVIDIA Global AI Hackathon (deadline 2026-10-30). Two parts:

- **`plugin/`** — the product. Zero-dependency Node package: the moderator engine, an HTTP handler (Express or plain Node), and a drop-in widget. This is what another site installs.
- **The Next.js app** — a small demo host for the plugin: a feed with two people and a moderator queue.
- **`extension/`** — a browser extension (Chrome MV3) for YouTube and Reddit. It catches the site's Post click, asks our server (`/api/ext/check`), and only lets the post through when it's allowed. Rude/severe/unsure/unavailable all stay blocked; unsure comments wait for a moderator on `/mod`. It never holds the model key, and if it can't read a known comment box it blocks rather than letting it through.

Keep it simple. The previous, larger design (audience decisions, friend banter, pile-on detection, a shield, freeze-out detection) was deliberately removed on 2026-10-18 as unnecessary complexity. Do not bring those back unless asked.

---

## Stack

- **NVIDIA Nemotron 3 Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`) on **Nebius Token Factory** — every AI call. Required by the hackathon. Reasoning off, temperature 0.
- **Next.js** (App Router, TypeScript) + **Tailwind 4** for the demo app
- **Supabase** (Postgres + Realtime broadcast) for the demo app's data and the live moderator queue
- Deploy on Vercel

---

## Non-negotiable rules

Design invariants. Do not break them for convenience; flag it if a requested change would.

1. **Every comment is checked on its own words. Always.** No whitelist, no fast lane, no trusted users.
2. **Context can only make things stricter or the suggestion better, never the verdict looser.** The post being replied to may shape the *suggestion*; it never lowers a score. The local keyword hint can escalate a verdict, never allow one.
3. **Post only when `allowed` is true.** That is the plugin's whole contract with the host.
4. **Severe comments are not posted, and are explained, not just blocked.** The writer is told what the comment does, why it is harmful or wrong, and what they could say instead — then they edit it themselves. **No AI rewrite of threats, hate, doxxing or self-harm encouragement.** Severe comments also go to the moderator queue automatically.
5. **Nothing is refused silently.** Every unposted comment has a plain-language reason the writer can read.
6. **Fail closed.** If the model errors, times out or returns junk, nothing is posted and the writer is told. Never default to posting.
7. **The suggestion is offered, never forced.** `[Use this]`, `[Edit]` and `[Ask a moderator]` are always present for a rude comment. If no good suggestion passes the checks, show the reason without one.
8. **Humans handle the unclear.** A writer who thinks the check is wrong can ask a moderator; an unanswered request times out and the comment stays unposted. If the model can't read a non-English comment with confidence, it does not guess — the comment goes to a moderator.

---

## The pipeline

```
Writer posts a comment
   │
   ▼
Nemotron scores the words alone → { score, category, reason }
   │
   ├── clean  (score < 0.40)  → allowed: posts
   │
   ├── rude   (0.40 – 0.85)   → not posted. Reason + a suggested rewrite
   │                              [Use this] → posts the exact suggestion shown
   │                              [Edit]     → writer edits, checked again from the top
   │                              [Ask a moderator] → review queue (10-minute timeout, fails closed)
   │
   ├── severe (≥ 0.85)        → not posted. Explanation of what's wrong and why;
   │                              writer edits it themselves. Sent to moderators automatically.
   │
   ├── unsure (non-English)   → not posted yet; a moderator decides. When the model can't read a
   │                              non-English comment with confidence, or it scores just under the
   │                              line (0.25–0.40), we don't guess. (Indian languages, Tanglish etc.)
   │
   └── model unavailable      → not posted. "Couldn't check right now, try again."
```

**Suggestion checks** (all must pass before a rewrite is shown): same script as the original (Hindi in, Hindi out), keeps the writer's meaning (a model check), and itself scores clean. Two attempts, then no suggestion.

**Thresholds** live in `lib/config.ts` (app) and default in the plugin (`cleanMax`, `severeMin`). Tune against `npm run eval`; do not ship guesses.

---

## LLM job vs code job

| Question | Handled by |
|---|---|
| What does this text mean? Is it harmful? A better way to say it? Same meaning? | Nemotron |
| Same script? Thresholds, timeouts, masking emails/phones, queue state | Code |

Prompts live in `plugin/src/prompts.mjs` (scoring, rewrite, meaning check). Every scoring call returns strict JSON `{ score, category, reason }`; the `reason` is shown to the writer, so it must be plain language, in the writer's language. Every rewrite prompt keeps **"Reply in the same language and script as the input."**

Never send a comment to the model per keystroke — check on send (the widget waits for a typing pause).

---

## Schema (demo app)

Only these tables are used: `users`, `posts`, `comments` (`visibility` is `public` or `blocked`, `reason`, `score`, `category`, `rewrite_text` = the suggestion shown), and `reviews` (one row per moderator review; `decision` approve/uphold, `resolved_at`). Older tables from the previous design (`relationships`, `signals`, `reports`, `blocks`) still exist in the migrations but are unused.

---

## Conventions

- All moderation constants in `lib/config.ts` (app) — no magic numbers in components.
- All model calls go through the plugin (`plugin/src/`); the app gets its instance from `lib/moderator.ts`. Never call the model API from a component.
- Every function that leaves a comment unposted writes the `reason`.
- Server-side checking only. A client-side check is a client-side bypass (the keyword hint in the composer is display-only).
- In development every model call is logged to `logs/llm-calls.jsonl` — you will need these when tuning.
- `npm test` runs the plugin's tests (stub model, no network). `npm run eval` runs the 63-case set against the real model.

## Demo data

Two people only: **Maya** (posts) and **Alex** (replies). `npm run seed` resets everything.
