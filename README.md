# Argus: a comment moderator that tells you what you *could* say

> Most moderators say no. Argus says why, and shows you what you could say instead. Built on NVIDIA Nemotron.

- **Live demo:** https://redraft-nine.vercel.app (moderator queue at [`/mod`](https://redraft-nine.vercel.app/mod))
- **Browser extension:** [download `argus-extension.zip`](argus-extension.zip?raw=1), then [install it](extension/README.md#install-chrome-edge-brave). It uses the live demo server out of the box
- **Demo video:** _TODO: YouTube link_

Argus is a drop-in comment moderator. When someone writes a rude comment, it doesn't just block it. It shows a better way to say the same thing, and the writer chooses **Use this**, **Edit** or **Ask a moderator**. When a comment is genuinely harmful (a threat, hate, someone's private phone number), it isn't posted, and the writer is told **what's wrong and why** so they can rewrite it themselves.

**Every AI decision runs on NVIDIA Nemotron 3 Ultra, served by Nebius Token Factory.**

- **Hackathon:** Nebius x NVIDIA Global AI Hackathon 2026, *Best Apps and Agents* track
- **Three parts, one engine:** [`plugin/`](plugin) is the drop-in moderator for websites (engine + server handler + widget, zero dependencies); [`extension/`](extension) is a browser extension that blocks the Post button on **YouTube, Reddit and Instagram** (and, if you turn it on, WhatsApp Web) until a comment is allowed; and the Next.js app is a demo site plus the moderator queue

## What the writer sees

| They write | What happens |
|---|---|
| "Great news, congrats!" | Posts |
| "i hate you" (on a post about singing) | Not posted yet. *This tells another person you hate them.* Suggestion: **"I'm not a fan of your singing."** → Use this / Edit / Ask a moderator |
| "Women shouldn't be allowed to sing on stage. Go back to the kitchen." | Can't be posted. *This says women can't perform because of their gender. Singing ability has nothing to do with gender, and comments like this push women out of music.* → Edit my comment (no AI rewrite; also sent to a moderator) |
| "enna idhu da" (Tanglish the AI can't read with confidence) | Not posted yet. *We couldn't be sure what this means, so a person will check it.* → a moderator approves or keeps it unposted |
| *(the AI is unreachable)* | Not posted. "We couldn't check this comment right now." It fails closed, never open |

## How it works

```
comment → Nemotron scores the words alone (0..1 + category + plain-language reason)
   ├── clean  (< 0.40)    → posts
   ├── rude   (0.40–0.85) → reason + a checked rewrite: Use this / Edit / Ask a moderator
   ├── severe (≥ 0.85)    → explanation of what's wrong and why; writer edits it; moderators notified
   ├── unsure             → a non-English comment the AI can't read with confidence: a moderator decides
   └── model down         → nothing posted, writer told to try again

Ask a moderator / unsure → waits unposted; no answer in 10 minutes → stays unposted (fails closed)
```

A suggestion is only shown if it **passes three checks**: it's in the same language and script as the original (Hindi in, Hindi out), a second Nemotron call confirms it keeps the writer's meaning, and it **scores clean itself**. The suggestion can use the post being replied to ("I'm not a fan of *your singing*"), but the verdict never does: every comment is judged on its own words.

Other safeguards: emails and phone numbers are masked before text reaches the model; an instant keyword check flags obvious threats while typing and can only make a verdict stricter; the plugin's endpoints have an optional secret key and a per-IP rate limit, so nobody can spend your model credits.

## Using NVIDIA Nemotron on Nebius Token Factory

All model calls go through [`plugin/src/nemotron.mjs`](plugin/src/nemotron.mjs), an OpenAI-compatible client pointed at Token Factory with **`nvidia/Nemotron-3-Ultra-550b-a55b`**, reasoning off, temperature 0, with retries on rate limits. Three prompts in [`plugin/src/prompts.mjs`](plugin/src/prompts.mjs): **scoring** (including the "explain why" text for severe comments, so that costs no extra call), **rewrite**, and the **meaning check**.

### Evaluation

[`scripts/eval-set.ts`](scripts/eval-set.ts) holds 85 hand-labelled comments: praise, disagreement, profanity used for emphasis, reports *of* abuse, insults, sarcasm, violent hyperbole, prompt-injection attempts, threats, doxxing, self-harm encouragement, Spanish, and Indian languages — Tamil in its own script and typed in English letters (Tanglish, including compliments vs insults and alternate spellings), Hindi and Hinglish.

**Current (85 cases, Nemotron 3 Ultra): 98.8% (84/85), severe caught 17/17, 0 failed closed.** Two Tanglish comments the model couldn't read with confidence went to a person instead of being guessed.

The model comparison below was run on the first 63 cases, fresh runs, no cache:

| Model on Token Factory | Accuracy | Severe caught | Failed closed |
|---|---|---|---|
| **Nemotron 3 Ultra (550B-A55B)** ✅ used | **98.4%** (62/63) | 15/15 | 0 |
| Nemotron 3.5 Super-VL | 98.4% | 15/15 | 0 |
| Nemotron 3 Super (120B-A12B) | 95.2% | 15/15 | 0 |
| Nemotron 3 Nano (30B-A3B) | 88.9% | 15/15 | 0 |
| Nemotron 3.5 Lightning | 87.3% | 14/15 | 2 |
| *MiniMax M3 (original prototype model)* | *98.4% on its own API, 93.7% via Token Factory* | *15/15* | *0 / 4* |

The one miss ("You're a pathetic excuse for a developer, delete your account") scores exactly on the severe line, so it errs toward explaining rather than suggesting. Turning Nemotron's reasoning off mattered: with it on, the same engine scored 82.5%, because the model sometimes answered the comment instead of judging it.

## Run it

You need Node 20+, a [Nebius Token Factory](https://tokenfactory.nebius.com) API key and, for the demo app, a [Supabase](https://supabase.com) project.

**Just the plugin** (no database):

```bash
cd plugin && npm test
```

```bash
cd plugin && NEBIUS_API_KEY=your-key npm run demo
```

Open http://localhost:8790 for the drop-in widget on its own. See [`plugin/README.md`](plugin/README.md) to add it to your own site.

**The demo app:**

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Nebius key and the three Supabase values.
3. In the Supabase SQL editor, run the files in [`supabase/migrations/`](supabase/migrations) in order.
4. `npm run seed` creates Maya and Alex, three posts and a few replies.
5. `npm run dev`, then open http://localhost:3000. The moderator queue is at `/mod`.

| Command | What it does |
|---|---|
| `npm test` | Plugin tests with a stub model (no network, no cost) |
| `npm run eval` | The 85-case set against the real model |
| `npm run seed` | Reset the demo data |

## Project layout

```
plugin/              the product: engine, Nemotron client, prompts, HTTP handler, widget, tests, demo
app/                 demo app pages (feed, /mod) and API routes
extension/           Chrome extension (YouTube, Reddit, Instagram, WhatsApp Web) + test bench
components/          composer + suggestion card, comments, review cards
lib/                 config, the app's moderator instance, comments, review queue, feed
scripts/             seed, eval, eval set
supabase/migrations/ schema
```

## Built during the hackathon

<!-- TODO(Sharon): confirm these dates before submitting. Devpost asks what was significantly updated during the submission period (from Aug 26, 2026). -->

The project began on Aug 23, 2026, just before the submission period opened on Aug 26. Built or significantly updated during the submission period:

- Moved every model call to NVIDIA Nemotron 3 Ultra on Nebius Token Factory, after evaluating all five Nemotron models available there
- Rebuilt the moderator as a drop-in plugin with zero dependencies (engine, server handler, widget, tests)
- Severe comments are now explained (what's wrong and why) instead of hard-blocked, with no AI rewrite
- Suggestions use the post being replied to, and are checked for language, meaning and safety before they're shown
- Tamil, Tanglish, Hindi and Hinglish: read correctly, suggestions in the writer's own language, and comments the AI can't read with confidence go to a moderator instead of a guess
- The browser extension for YouTube, Reddit, Instagram and WhatsApp Web
- Fail-closed behaviour, privacy masking, a rate-limited and optionally secret-protected API, and a moderator queue with timeouts (in the demo app and in the plugin itself)

## Nebius and NVIDIA tools used

- **NVIDIA Nemotron 3 Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`): every AI call (scoring, rewrite, meaning check)
- **Nebius Token Factory**: serves the model through its OpenAI-compatible API. Switching models was a one-line change, which is how we ran the full eval against five Nemotron models and picked on evidence
- No Nebius AI Cloud

## Feedback

- **Token Factory's OpenAI-compatible API** made switching models a one-line change, so comparing five Nemotron models on our 85-case eval took an afternoon.
- **Nemotron 3 Ultra** was the most accurate and wrote the best rewrites. Nano was fast but weaker on sarcasm and Indian languages.
- **Reasoning off mattered a lot:** with it on, accuracy dropped to 82.5%, because the model sometimes replied to the comment instead of judging it. A note about this in the docs for classification tasks would help.
- **Indian languages typed in English letters** (Tanglish) needed explicit examples in the prompt; without them some compliments were read as insults.
- We hit occasional rate limits and server errors and added retries; published per-tier rate limits would help.
- The same third-party model scored lower through Token Factory than on its own API (MiniMax M3: 93.7% vs 98.4%), which may be worth a look.

## License

[MIT](LICENSE)
