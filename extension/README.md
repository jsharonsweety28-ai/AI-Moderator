# Argus browser extension (YouTube, Reddit, Instagram, WhatsApp Web)

Checks your comment when you click **Comment / Reply / Save / Post / Send** (or press the key that sends) before the site sees it:

| Site | What's checked | Sends with |
|---|---|---|
| YouTube | Comments and replies | Comment button, Ctrl/Cmd+Enter |
| Reddit (new and old) | Comments and replies | Comment/Save button, Ctrl/Cmd+Enter |
| Instagram (web) | Comments on posts; messages **only if you switch private messages on** | Post / Send icon, Enter |
| WhatsApp Web | Messages, **only if you switch private messages on** | Send, Enter |

Private messages (WhatsApp Web, Instagram DMs) are handled differently: **checked but never saved** on the server, never shown to a moderator, and no page context is sent. A message the AI can't read with confidence is blocked with "try rephrasing it" instead of going to a moderator.


| Your comment | What happens |
|---|---|
| Fine | Posts as normal |
| Rude | **Blocked.** Reason + a better way to say it. **Use this** posts the suggestion; **Edit** lets you rewrite it |
| Harmful (threats, hate, doxxing) | **Blocked.** Explanation of what's wrong and why. You must edit it |
| The AI isn't sure (e.g. Tanglish) | **Blocked** until a moderator decides on the Argus `/mod` page. If approved, **Post it**. (WhatsApp: rephrase it instead) |
| Can't reach the Argus server | **Blocked** (fails closed). **Try again** |

**Repeated harshness.** From the 3rd harsh message to the same person (the open chat on WhatsApp Web and Instagram DMs), or the 3rd harsh comment on the same post or video, within 7 days, the card adds a line: *"This is your 3rd harsh message to this person this week."* Only the writer sees it, and it never changes what's allowed. It is kept in this browser only (`chrome.storage.local`): who it was to is stored as a hash, never the name or the message, and entries are erased after 30 days. **Clear my history** in the settings removes it all. Only sends blocked as rude or harmful count, not drafts flagged while typing.

**While you type**, a small Argus badge sits in the corner of the comment box, like Grammarly's: ✓ green (fine), ! amber (rude: click it for a better way to say it), ! red (can't be posted: click for why), ! purple (a moderator will check it when you post). The badge is only a hint; the real check happens when you click Post.

### Keeping AI costs down

- The badge checks only **after you pause typing** (1.5 s), never on every keystroke, and skips anything under 4 characters.
- **The same text is never checked twice**, in your browser or on the server (the server remembers recent answers for 30 minutes).
- Live checks ask only for the verdict (**1 AI call**). A better way to say it (3 calls) is made **only when you click the badge**.
- When you click Post, the server usually already has the answer, so **the Post check is often free**.
- At most **6 live checks a minute** per tab; past that the badge waits and the Post check still runs.
- Measured: a friendly comment costs 1 call in total; a rude one with a suggestion, used and posted, costs 4 (about $0.006 on Nemotron 3 Ultra).

The extension only talks to your Argus server. Your Nebius/Nemotron key stays on the server.

## Install (Chrome, Edge, Brave)

1. Download [`argus-extension.zip`](../argus-extension.zip?raw=1) and unzip it (or use this `extension` folder from the repo).
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. It uses the live demo server, `https://redraft-nine.vercel.app`, out of the box. To use your own (for example `npm run dev` at `http://localhost:3000`), click the Argus icon in the toolbar, change **Server address** and click **Save**.
6. Open a YouTube video, a Reddit post or an Instagram post, write a comment and click **Comment** / **Post**.
7. For WhatsApp Web and Instagram messages: tick **Check my private messages** in the Argus settings, click **Save**, and reload the tab.

Moderators approve or reject waiting comments at [`/mod`](https://redraft-nine.vercel.app/mod) on the server, under "From the browser extension".

## Limits

- Works in desktop browsers. Phone **apps** (the Instagram or YouTube app) can't run extensions. Mobile browsers that support extensions (Firefox and Edge on Android, Safari on iPhone) can.
- Anyone who controls the browser can turn an extension off. For a real block, install it through managed browser policy (school or work devices), where users can't remove it.
- If the site changes its comment box and Argus can't read it, Argus blocks the post and says so, rather than letting an unchecked comment through.
- A deployed server must be added to `host_permissions` in `manifest.json` if it isn't on `*.vercel.app`.

## Test without logging in

`extension/test/` has local copies of YouTube's, Reddit's and Instagram's comment boxes and WhatsApp Web's message box (including Reddit's editor inside a shadow root) with a stand-in for the extension's background script:

```bash
node extension/test/serve.mjs
```

Open http://localhost:8792 (YouTube/Reddit) or http://localhost:8792/social?site=instagram / ?site=whatsapp&whatsapp=on, while the Argus server runs on port 3000.
