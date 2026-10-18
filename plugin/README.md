# AI Moderator plugin

Checks each comment with NVIDIA Nemotron (on Nebius Token Factory) before it posts:

- **Clean** → allowed.
- **Rude** → not allowed. A plain reason, plus a better way to say the same thing that has already passed the check. The writer can use it, edit, or ask a moderator.
- **Severe** (threats, hate, doxxing, self-harm encouragement) → not allowed. An explanation of what's wrong, why, and what to say instead. The writer rewrites it themselves; there's no AI rewrite.
- **Model unavailable** → not allowed (fail closed), and the writer is told.

Your app has one rule: **post the comment only when `allowed` is true.**

Requires Node 20+. No npm dependencies.

## Engine only

```js
import { createModerator } from './plugin/src/index.mjs';

const moderator = createModerator();            // reads NEBIUS_API_KEY
const result = await moderator.moderate('i hate you', { replyingTo: 'Got invited to sing at a big event!' });
// { allowed: false, verdict: 'rude', reason: 'This tells another person you hate them.',
//   suggestion: "I'm not a fan of your singing.", score: 0.45, category: 'insult' }
```

`replyingTo` is optional. It only shapes the suggestion; the verdict always comes from the comment's own words.

## Server routes + widget

```js
import { createModeratorService, moderatorHandler } from './plugin/src/index.mjs';

const moderation = moderatorHandler(createModeratorService(), {
  base: '/api/plugin',
  secret: process.env.MODERATOR_KEY, // optional: require header x-moderator-key
  perMinute: 20,                     // checks per client IP per minute
});
// Express:    app.use(moderation);
// Plain http: http.createServer((req, res) => moderation(req, res, () => yourRoutes(req, res)));
```

This adds `POST /preview` (instant typing hint), `POST /check` (`{ text, replyingTo? }`), `POST /accept` (`{ id }`, returns the exact suggestion shown) and `GET /decisions`.

```html
<link rel="stylesheet" href="/moderator-widget.css">
<div id="moderator"></div>
<script src="/moderator-widget.js"></script>
<script>
  AIModerator.mount(document.querySelector('#moderator'), {
    endpoint: '/api/plugin',
    replyingTo: 'the post text',          // optional
    onAllowed: text => postYourComment(text),
  });
</script>
```

Restyle the widget with the `--aim-*` CSS variables on `.aim`.

## Options

| Option / env | Default | Purpose |
|---|---|---|
| `NEBIUS_API_KEY` | none | Token Factory key. Server side only |
| `LLM_MODEL` | `nvidia/Nemotron-3-Ultra-550b-a55b` | Model name |
| `LLM_BASE_URL` | `https://api.tokenfactory.nebius.com/v1` | Any OpenAI-compatible endpoint |
| `createModerator({ call })` | Nemotron | Any `async (messages, maxTokens) => string`, to use another model |
| `createModerator({ cleanMax, severeMin })` | `0.40`, `0.85` | Verdict thresholds |
| `createModeratorService({ persist })` | memory only | `async (item, decisions) => 'storage label'`, to save decisions |

## Privacy

Emails, phone numbers and 12-digit ID numbers are masked before text is sent to the model. Nothing is posted without the host app's decision.

## Try it

```bash
npm test                              # stub model, no network
NEBIUS_API_KEY=your-key npm run demo  # widget demo on http://localhost:8790
```
