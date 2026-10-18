# Demo runbook — Redraft

~7 minutes, five acts. Every scripted line below is already in the response cache, so the
demo path works even on dead venue wifi. Local dev server and the deployed site share one
database — mix freely.

## Before judges arrive

1. `npm run seed` — clean slate (wipes test comments; cache stays warm).
2. Open the feed on the laptop (localhost:3000 or redraft-nine.vercel.app) as **@maya**.
3. Open `/mod` on a second screen or phone — leave it visible.
4. Terminal ready for `npm run pileon`.
5. Optional second device signed in as **@dev** for the live cross-device moment.

## Act 1 — The nudge (the pitch in one interaction)

Switch to **@alex_new**, comment on Maya's post:

> this looks awful and so do you, stick to something you're actually good at

Held, with a plain reason. Point at the suggestion: **"This looks awful."** — the opinion
survived, the attack didn't. Tap **Use this** → it posts. Say the pitch: *"every moderation
system tells you what you can't say; ours tells you what you could say instead."*

Quick tone beat while here: comment `what the fuck is this` — it passes every rule, still
posts either way, but gets a one-tap de-edged offer first. Nothing blocked, register nudged.

## Act 2 — Friendship decides audience, never acceptability

As **@dev** on Maya's post:

> lmao maya you absolute disaster, took you two whole weeks for THIS?

Held → **Request review** → *visible in full only to Dev and Maya* (120 days of mutual banter).

As **@rohan** on Priya's post:

> growing what exactly? another project you'll abandon halfway like always?

Held → **Request review** → *collapsed for everyone* (one-directional, reciprocity 0.07).

Same class of words — different audiences. Switch to **@priya**, then **@maya**, to show both renderings.

## Act 3 — The pile-on and the shield

Run `npm run pileon`. While it floods (~30s), narrate: 21 comments, most individually mild —
each one passes on its own; the harm is the aggregate.

- The `/mod` screen updates live: the threat arrives in the severe lane as evidence.
- As **@dev**: the whole mob is one folded line — *"replies collapsed — thread cooling down."*
- As **@maya**: *"replies were hidden."* Tap **Summarize** — counts and categories, never quotes,
  and the threats note says moderators already have them. Show that **Show them** exists and
  is deliberately undersold.

## Act 4 — The comfort dial

As **@maya**, publish with **No criticism** selected:

> Trying a new logo direction for redraft. First rough attempt — be gentle, it's early.

(Every published post now draws automatic cast reactions over the next ~20s, generated from the
post's content and run through the real pipeline. On this dial setting, any critical reaction
collapses itself live — a free bonus beat. Reactions are LLM-generated: cached only if you
rehearse with this exact post text, so keep the wording identical on demo day.)

As **@dev**, comment (cached, instant):

> honestly the old logo was better than this direction

Show three seats: Dev sees his comment collapsed with the honest reason; Priya sees a one-line
stub she can open; Maya gets a summary instead of the comment. Then Dev's
`love the ambition here, excited to see where it goes` posts untouched — the dial never eats praise.

## Act 5 — Pattern watch (the closer)

Scroll `/mod` down: **Priya's freeze-out card** — four one-directional, mildly negative
relationships, posting rate 4 → 1. *"No single message crossed a line — the pattern did."*
This is the answer to "what about harassment that never trips a filter?"

## If something goes wrong

- LLM hangs or wifi dies mid-comment → the fail-closed message appears. Say it proudly:
  *"if we can't check it, it doesn't post — the system never fails open."* Retry; scripted
  lines are cached and instant.
- Feed looks messy → `npm run seed` resets everything in ~10 seconds.
- Tension expired before Act 3 payoff → re-run `npm run pileon` (idempotent).

## Judge Q&A crib

- **"Why did my mild insult pass?"** → the three-score table: "thats very bad" 0.20 · "what the
  fuck is this" 0.25 (thing) · "what the fuck is wrong with you" 0.55 (person). We score harm
  to people, not negativity or profanity.
- **"What about 'I'll kill you' between friends?"** → the gradient: bare threat 0.95 extreme ·
  "…for eating my fries" 0.65 held-but-reviewable · "say that again and…" always extreme.
  Jokes must carry their frame in the words; friendship never lowers a score (or "follow them
  first" becomes the harassment playbook).
- **"Where's your training data?"** → No trained model: NVIDIA Nemotron on Nebius Token Factory + a written rubric, validated
  on a 63-case hand-built eval (98.4% on Nemotron 3 Ultra, every severe case caught, `npm run eval`). Real ground
  truth accrues in the append-only `signals` table — every reviewer decision and target
  reaction, zero annotation cost.
- **"Bot detection?"** → We never claim it. We detect coordination (co-occurrence), and only a
  human ever bans.
