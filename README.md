# Redraft: moderation that tells you what you *could* say

> Every moderation system tells users what they can't say. None tells them what they could say instead.

Redraft is an AI comment moderator. When a comment is rude, it doesn't just block it. It offers the author a version that keeps their point without the attack, and the author decides: **Use this**, **Edit**, or **Request review**.

Underneath that are the rest of the parts a real platform needs: an audience decision based on relationship history, a human review queue, pile-on detection, a "shield" that summarizes abuse so the target never has to read it, and detectors for harassment that no single message reveals.

**Every AI job runs on NVIDIA Nemotron 3 Ultra, served by Nebius Token Factory.**

- **Live demo:** https://redraft-nine.vercel.app (use the user switcher, top right)
- **Moderator dashboard:** https://redraft-nine.vercel.app/mod
- **Hackathon:** Nebius x NVIDIA Global AI Hackathon 2026, *Best Apps and Agents* track

---

## What it does

```
User types a comment
   │
   ▼
AI #1: score the words alone (0..1 + category + plain-language reason)
   │
   ├── clean    → posts publicly
   │
   ├── extreme  → hard block. No rewrite. Slow "this was wrong" appeal lane.
   │
   └── rude     → held, and a rewrite is offered
                    ├── Use this        → the rewrite posts (it already passed the scorer)
                    ├── Edit            → rescored from the top
                    └── Request review  → AI #2 decides the AUDIENCE, never the permission
                                            ├── long mutual banter → visible to the recipient only
                                            ├── stranger / one-way → collapsed for everyone
                                            └── unclear            → human review queue (fails closed on timeout)
```

Around that pipeline:

- **Pile-on detection** (every minute, pure SQL plus one similarity signal): a burst only counts if it is also mostly negative, mostly strangers or new accounts, cliff-shaped and repetitive. When it fires, the post's tension rises and the shield engages.
- **The shield:** "18 replies were hidden. [Summarize] [Show them] [Keep hidden]". *Summarize* is the primary action. It describes and counts, and never quotes. This is enforced in code, not just in the prompt. Threats skip the target entirely and go to moderators as evidence.
- **Comfort dial:** a post's author can choose *no personal criticism* or *no criticism*. Matching comments collapse with a reason, and praise is never collapsed.
- **Pattern watch:** freeze-out detection (4+ cold, one-directional relationships aimed at one person whose posting is declining) and co-occurrence of accounts that keep appearing together. Counting only, no model, and log-only.
- **Report / mute / block / remove:** reports open a review in their own lane on `/mod`. Every reviewer decision and target reaction is appended to a `signals` table, which builds labelled training data at no annotation cost.

## Design rules (enforced in code)

1. Every comment is scored on its words first. No whitelist, no fast lane.
2. Context can only make things stricter, never looser.
3. Friendship decides **who sees** a comment, never **whether it is acceptable**.
4. Humans handle the unclear, not the worst. The extreme tier is never queued.
5. Nothing is hidden silently. Every hidden comment shows its author a reason and a way forward.
6. **Fail closed.** If the model errors, times out or returns junk, the comment stays blocked and the author is told.
7. The rewrite is offered, never forced.
8. The target never has to read the abuse. They get a summary first, and the comments only if they ask.

## How it uses NVIDIA Nemotron and Nebius Token Factory

All model calls go through one client, [`lib/moderation/llm.ts`](lib/moderation/llm.ts), which uses Token Factory's OpenAI-compatible API with **`nvidia/Nemotron-3-Ultra-550b-a55b`**, reasoning turned off and temperature 0. The model does five jobs, each with its own prompt in [`lib/moderation/prompts.ts`](lib/moderation/prompts.ts):

| Job | What Nemotron does | File |
|---|---|---|
| AI #1: scoring | Strict JSON `{score, category, reason, coarse, target}`; the reason is shown to the user | `score.ts` |
| Rewrite | Same point without the attack, **in the same language and script** (Hindi in, Hindi out) | `rewrite.ts` |
| Rewrite fidelity check | "Does this rewrite still say what the author meant?" | `rewrite.ts` |
| AI #2: audience | Given relationship history and post tension: recipient-only, collapsed, or human review | `audience.ts` |
| Similarity | "Are these N comments the same message reworded?" (one pile-on signal) | `similarity.ts` |
| Shield summary | Describe and count the hidden comments without quoting them | `shield.ts` |

Rewrites check themselves: a suggestion is only shown if it passes the language gate, the fidelity check **and** scores clean when run back through AI #1. The suggestion is stored, so *Use this* posts exactly what the author saw.

Code handles everything about counting, timing and grouping (pile-ons, freeze-outs, coordination). The model only judges what text means.

### Choosing the model: evaluation

[`scripts/eval-set.ts`](scripts/eval-set.ts) is a hand-labelled set of 63 comments: praise, disagreement, profanity used for emphasis, reports *of* abuse, insults, violent hyperbole, prompt injection, threats, self-harm encouragement, and Hindi and Spanish cases. We ran it fresh (no cache) on every Nemotron model available on Token Factory, plus the MiniMax M3 baseline the project was originally built on:

| Model | Accuracy | Severe cases caught | Failed closed |
|---|---|---|---|
| **Nemotron 3 Ultra (550B-A55B)** ✅ chosen | **98.4%** (62/63) | 15/15 | 0 |
| Nemotron 3.5 Super-VL | 98.4% (62/63) | 15/15 | 0 |
| Nemotron 3 Super (120B-A12B) | 95.2% (60/63) | 15/15 | 0 |
| Nemotron 3 Nano (30B-A3B) | 88.9% (56/63) | 15/15 | 0 |
| Nemotron 3.5 Lightning | 87.3% (55/63) | 14/15 | 2 |
| *MiniMax M3, its own API (old baseline)* | *98.4% (62/63)* | *15/15* | *0* |
| *MiniMax M3, via Token Factory* | *93.7% (59/63)* | *15/15* | *4* |

We also ran every rude comment through the full rewrite pipeline. Ultra produced a verified rewrite for 16 of 26 with no errors. Combining Ultra with MiniMax (taking the stricter or the average score) didn't improve accuracy, because the two models agree on 61 of 63 comments and make the same single mistake. So everything runs on Nemotron. Ultra's one miss is a borderline case scored exactly on the 0.85 extreme line, so it errs toward blocking.

Thresholds live in [`lib/config.ts`](lib/config.ts) (`CLEAN_MAX = 0.40`, `EXTREME_MIN = 0.85`). `npm run eval` reruns the set and grid-searches both thresholds.

## Tech stack

- **Next.js 16** (App Router, TypeScript) and **Tailwind 4**
- **NVIDIA Nemotron 3 Ultra** on **Nebius Token Factory** for all text understanding
- **Supabase**: Postgres, plus Realtime broadcast for the live moderator dashboard
- **Vercel** for hosting

## Run it locally

You need Node 20+, a [Supabase](https://supabase.com) project and a [Nebius Token Factory](https://tokenfactory.nebius.com) API key.

1. **Install:** `npm install`
2. **Configure:** copy `.env.example` to `.env.local` and fill in the Nebius key and the three Supabase values.
3. **Create the schema:** in the Supabase SQL editor, run the files in [`supabase/migrations/`](supabase/migrations) in order (`00001` → `00004`).
4. **Seed demo data:** `npm run seed` creates the cast, backdated relationship history and 20 pile-on accounts.
5. **Start:** `npm run dev`, then open http://localhost:3000 and http://localhost:3000/mod.

Other scripts:

| Command | What it does |
|---|---|
| `npm run eval` | Score the 63-case set, print the confusion matrix, grid-search thresholds |
| `npm run pileon` | Flood a post with a scripted pile-on to trigger detection and the shield |
| `npm run warm` | Pre-cache the model responses for every scripted demo line (insurance for bad wifi) |
| `npm run activity` | Generate reactions to a post through the real pipeline |

The full demo script is in [`docs/DEMO.md`](docs/DEMO.md), and the build log in [`docs/PLAN.md`](docs/PLAN.md).

## Project layout

```
app/                 pages (feed, /mod) and API routes
components/          UI: composer + nudge card, comments, shield banner, review cards
lib/config.ts        every threshold and moderation constant
lib/moderation/      the pipeline: llm client, scoring, rewrite, audience, shield,
                     similarity, pile-on sweep, review queue, pattern watch
scripts/             seed, eval, pile-on demo, cache warmer
supabase/migrations/ schema
```

## Built during the hackathon

<!-- TODO(Sharon): confirm these dates before submitting. Devpost asks what was significantly updated during the submission period (from Aug 26, 2026). -->

The project began on Aug 23, 2026, just before the submission period opened on Aug 26. Built or significantly updated during the submission period:

- Moved every model call to **NVIDIA Nemotron 3 Ultra on Nebius Token Factory**, after evaluating all five Nemotron models on Token Factory against the original MiniMax baseline
- Reports now go to moderators through their own lane on `/mod`
- Rewrites are stored, so *Use this* posts exactly what the author was shown
- A code-enforced guard so shield summaries never quote hidden comments
- Review timeouts that fail closed without anyone opening the dashboard
- The tone nudge, violent-hyperbole scoring rules, the per-post comfort dial, freeze-out and co-occurrence pattern watch, and bystander collapse during pile-ons

## License

[MIT](LICENSE)
