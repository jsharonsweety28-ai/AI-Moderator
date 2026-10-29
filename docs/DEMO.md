# Demo script (about 3 minutes)

Before: `npm run seed`, open the feed (localhost:3000 or the deployed URL) as **Alex**, and open `/mod` in a second window.

## 1. The pitch (rude → a better way to say it)

On Maya's post *"Got invited to sing at a big event next month!! Pray for me"*, as Alex, type:

> i hate you

It isn't posted. Point at the card: the original is struck through, and underneath is **"I'm not a fan of your singing."** The opinion survives; the attack doesn't. It knew the post was about singing. Tap **Use this** and it posts.

Say the pitch: *"Most moderators say no. Argus says why, and shows you what you could say instead."*

## 2. Harmful → explained, not just blocked

Same post:

> Women shouldn't be allowed to sing on stage. Go back to the kitchen.

**This can't be posted**, followed by an explanation of what's wrong and why. No AI rewrite of hate or threats: the writer has to rewrite it themselves. Switch to the `/mod` window: it's already there under "Sent automatically".

## 3. Disagree with the AI → ask a person

On Maya's onboarding post:

> two weeks for this? you clearly have no idea what you're doing

Tap **Ask a moderator**. Alex sees "Only you can see this. A moderator will look at this shortly." In `/mod` it appears live with a 10-minute timer. Tap **Post it**, and it's posted.

## If something goes wrong

- Wifi dies mid-comment → "We couldn't check this comment right now, so it hasn't been posted." Say it proudly: *if we can't check it, it doesn't post.*
- Feed looks messy → `npm run seed` resets everything in seconds.

## Judge Q&A

- **"Where's your training data?"** → No fine-tuning: NVIDIA Nemotron 3 Ultra on Nebius Token Factory with a written rubric, validated on a 63-case labelled set (98.4%, every severe case caught, `npm run eval`). We compared all five Nemotron models on Token Factory.
- **"Is it a plugin?"** → Yes: `plugin/` has zero dependencies, mounts on Express or plain Node, and ships a drop-in widget. The demo site uses the same engine.
- **"What if the model is down?"** → It fails closed. Nothing posts unchecked.
- **"Hindi?"** → Suggestions and explanations come back in the writer's own language and script, checked in code.
