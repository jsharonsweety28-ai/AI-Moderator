// Redraft on YouTube and Reddit: catches the site's Post/Comment/Reply click (and
// Ctrl/Cmd+Enter) before the site sees it, checks the text, and only lets the post
// through when it's allowed.
//
//   clean       → posts, as if nothing happened
//   rude        → blocked; reason + a better way to say it ([Use this] posts that)
//   severe      → blocked; explanation; the writer must edit it
//   unsure      → blocked; a moderator decides; approved → [Post it]
//   unavailable → blocked (fail closed); [Try again]
(() => {
  if (window.__redraftLoaded) return;
  window.__redraftLoaded = true;

  const SITE = window.__REDRAFT_SITE || (location.hostname.includes('youtube') ? 'youtube' : 'reddit');
  // Buttons that publish a comment. Matched on the visible label or aria-label.
  const SUBMIT_LABEL = /^(comment|reply|save|post|send)$/i;
  // Containers that hold one comment box and its button, on each site.
  // The site-specific ones: if we can't read the text inside one of these, we block
  // rather than let an unchecked comment through (fail closed).
  const SITE_COMPOSER = 'ytd-commentbox, ytm-comment-simplebox-renderer, shreddit-composer, comment-composer-host, faceplate-form, form.usertext';
  const COMPOSER = [
    'ytd-commentbox',                    // YouTube desktop
    'ytm-comment-simplebox-renderer',    // YouTube mobile web
    'shreddit-composer',                 // Reddit (new)
    'comment-composer-host',             // Reddit (new)
    'faceplate-form',                    // Reddit (new)
    'form.usertext',                     // old.reddit.com
    'form',
  ].join(', ');
  const EDITOR = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
  const POLL_MS = 4000;

  // A composer whose current text was cleared to post: the next submit goes through.
  const cleared = new WeakMap(); // composer -> { text, until }
  const busy = new WeakSet();

  // ---------- finding the box, its button and its text ----------

  const asElements = (path) => path.filter((n) => n instanceof Element);

  function labelOf(el) {
    return (el.getAttribute('aria-label') || el.value || el.textContent || '').trim();
  }

  function submitButtonIn(path) {
    for (const el of asElements(path)) {
      if (el.matches('button, [role="button"], input[type="submit"]') && SUBMIT_LABEL.test(labelOf(el))) return el;
    }
    return null;
  }

  function composerIn(path) {
    return asElements(path).find((el) => el.matches(COMPOSER)) || null;
  }

  // querySelector that also looks inside shadow roots (Reddit uses web components) —
  // including the root element's own shadow root.
  function deepQuery(root, selector) {
    if (root.shadowRoot) {
      const inOwn = deepQuery(root.shadowRoot, selector);
      if (inOwn) return inOwn;
    }
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const found = deepQuery(el.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  }

  function deepQueryAll(root, selector, out = []) {
    if (root.shadowRoot) deepQueryAll(root.shadowRoot, selector, out);
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) deepQueryAll(el.shadowRoot, selector, out);
    return out;
  }

  const editorIn = (composer) => deepQuery(composer, EDITOR);
  const buttonIn = (composer) =>
    deepQueryAll(composer, 'button, [role="button"], input[type="submit"]').find((b) => SUBMIT_LABEL.test(labelOf(b))) || null;
  const isField = (el) => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  const textOf = (editor) => (isField(editor) ? editor.value : editor.innerText || '').trim();

  // What the comment replies to: the video or post title. Shapes the suggestion only.
  function replyingTo() {
    const pick = (sel) => document.querySelector(sel)?.textContent?.trim();
    const t =
      SITE === 'youtube'
        ? pick('h1.ytd-watch-metadata') || pick('#title h1') || document.title
        : document.querySelector('shreddit-post')?.getAttribute('post-title') || pick('h1') || document.title;
    return (t || '').slice(0, 300);
  }

  function setText(editor, value) {
    editor.focus();
    if (isField(editor)) {
      // React-controlled fields ignore .value = ...; use the native setter and fire input.
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value').set;
      setter.call(editor, value);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // Goes through the editor's own input handling (YouTube, Reddit's editor).
    if (!document.execCommand('insertText', false, value)) {
      editor.textContent = value;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }
  }

  // ---------- the card ----------

  const host = document.createElement('div');
  host.id = 'redraft-card-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .card { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; width: min(380px, calc(100vw - 32px));
      box-sizing: border-box; padding: 16px; border-radius: 14px; border: 1px solid #e3e6eb; background: #fff; color: #15171c;
      font: 14px/1.55 'Segoe UI', system-ui, -apple-system, sans-serif; box-shadow: 0 10px 30px rgba(21,23,28,.16); }
    .card[data-tone="warn"] { background: #fff8eb; border-color: #f6dfb4; }
    .card[data-tone="danger"] { background: #fef3f2; border-color: #f9d0cc; }
    .card[data-tone="ok"] { background: #ecfdf3; border-color: #b7ebc9; }
    .brand { font-size: 12px; color: #6a7180; margin-bottom: 4px; }
    .title { font-weight: 650; }
    [data-tone="warn"] .title, [data-tone="warn"] .reason { color: #8a4b08; }
    [data-tone="danger"] .title, [data-tone="danger"] .reason { color: #b42318; }
    [data-tone="ok"] .title { color: #067647; }
    .reason { margin-top: 4px; }
    .redraft { margin-top: 10px; padding: 10px 12px; background: #fff; border-radius: 10px; }
    .before { color: #6a7180; text-decoration: line-through; }
    .after { margin-top: 6px; }
    .after span { background: linear-gradient(transparent 12%, #fff3b0 12%, #fff3b0 88%, transparent 88%); padding: 0 2px; }
    .buttons { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center; }
    button { font: 600 14px 'Segoe UI', system-ui, sans-serif; border-radius: 10px; padding: 8px 14px; cursor: pointer; border: 1px solid #e3e6eb; background: #fff; color: #15171c; }
    button.primary { background: #2b4acb; border-color: #2b4acb; color: #fff; }
    [data-tone="danger"] button.primary { background: #b42318; border-color: #b42318; }
    button.close { margin-left: auto; border: 0; background: transparent; color: #6a7180; padding: 4px 6px; }
    .muted { color: #6a7180; font-size: 13px; }
    button:focus-visible { outline: 2px solid #2b4acb; outline-offset: 2px; }
  </style><div class="card" role="status" hidden></div>`;
  const card = shadow.querySelector('.card');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  let pollTimer = null;
  function hide() {
    card.hidden = true;
    clearTimeout(pollTimer);
  }
  function show(tone, html, actions = {}) {
    if (!host.isConnected) document.documentElement.appendChild(host);
    clearTimeout(pollTimer);
    card.dataset.tone = tone;
    card.innerHTML = `<div class="brand">Redraft</div>${html}`;
    card.hidden = false;
    for (const [name, fn] of Object.entries(actions)) card.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);
    card.querySelector('[data-act="close"]')?.addEventListener('click', hide);
  }

  // ---------- the flow ----------

  function postNow(composer, button, text) {
    cleared.set(composer, { text, until: Date.now() + 5000 });
    hide();
    (button && button.isConnected ? button : buttonIn(composer))?.click();
  }

  function editIt(editor) {
    hide();
    editor.focus();
  }

  async function check(composer, button, editor, text) {
    if (busy.has(composer)) return;
    busy.add(composer);
    show('', '<div class="title">Checking your comment…</div>');
    let r;
    try {
      r = await chrome.runtime.sendMessage({ type: 'check', text, site: SITE, replyingTo: replyingTo() });
    } catch {
      r = null;
    } finally {
      busy.delete(composer);
    }
    if (!r || r.error) r = { allowed: false, verdict: 'unavailable', reason: (r && r.error) || "We couldn't check this comment right now, so it hasn't been posted." };
    // The writer changed the text while we were checking: start over on their next click.
    if (textOf(editor) !== text) return hide();

    if (r.allowed) return postNow(composer, button, text);

    if (r.verdict === 'rude') {
      const redraft = r.suggestion
        ? `<div class="redraft"><div class="before">${esc(text)}</div><div class="after"><span>${esc(r.suggestion)}</span></div></div>`
        : `<div class="reason">Try saying how you feel about the video or post, not the person.</div>`;
      return show(
        'warn',
        `<div class="title">Not posted yet</div><div class="reason">${esc(r.reason)}</div>${redraft}
         <div class="buttons">${r.suggestion ? '<button class="primary" data-act="use">Use this</button>' : ''}<button data-act="edit">Edit</button></div>`,
        {
          use: () => {
            setText(editor, r.suggestion);
            // The suggestion already passed the check; post exactly that.
            setTimeout(() => postNow(composer, button, r.suggestion), 50);
          },
          edit: () => editIt(editor),
        }
      );
    }

    if (r.verdict === 'severe') {
      return show(
        'danger',
        `<div class="title">This can't be posted</div><div class="reason">${esc(r.reason)}</div>
         <div class="buttons"><button class="primary" data-act="edit">Edit my comment</button><span class="muted">A moderator can see this.</span></div>`,
        { edit: () => editIt(editor) }
      );
    }

    if (r.verdict === 'unsure' && r.id) return waitForModerator(composer, button, editor, text, r.id, r.reason);

    return show(
      'warn',
      `<div class="title">Couldn't check right now</div><div class="reason">${esc(r.reason)}</div>
       <div class="buttons"><button class="primary" data-act="retry">Try again</button><button class="close" data-act="close">Close</button></div>`,
      { retry: () => check(composer, button, editor, textOf(editor)) }
    );
  }

  function waitForModerator(composer, button, editor, text, id, reason) {
    show(
      'warn',
      `<div class="title">A moderator is checking this</div><div class="reason">${esc(reason)}</div>
       <div class="buttons"><span class="muted">It stays unposted until they decide. You can keep this tab open.</span><button data-act="edit">Edit instead</button></div>`,
      { edit: () => editIt(editor) }
    );
    const poll = async () => {
      if (card.hidden) return; // the writer moved on
      let s;
      try {
        s = await chrome.runtime.sendMessage({ type: 'status', id });
      } catch {
        s = null;
      }
      const status = s && s.status;
      if (status === 'approved') {
        if (textOf(editor) !== text) return hide();
        return show(
          'ok',
          `<div class="title">A moderator approved this</div><div class="reason">You can post it now.</div>
           <div class="buttons"><button class="primary" data-act="post">Post it</button><button class="close" data-act="close">Not now</button></div>`,
          { post: () => postNow(composer, button, text) }
        );
      }
      if (status === 'rejected' || status === 'expired') {
        const why = status === 'rejected' ? 'A moderator looked at this and kept it blocked.' : 'No moderator answered in time, so it stays blocked.';
        return show(
          'danger',
          `<div class="title">Not posted</div><div class="reason">${why} Edit it and try again.</div>
           <div class="buttons"><button class="primary" data-act="edit">Edit my comment</button></div>`,
          { edit: () => editIt(editor) }
        );
      }
      pollTimer = setTimeout(poll, POLL_MS);
    };
    pollTimer = setTimeout(poll, POLL_MS);
  }

  // ---------- catching the submit ----------

  function attempt(event, path, keyboard = false) {
    const button = keyboard ? null : submitButtonIn(path);
    if (!keyboard && !button) return;
    const composer = composerIn(path);
    if (!composer) return;
    const editor = editorIn(composer);
    if (!editor) {
      if (!composer.matches(SITE_COMPOSER)) return; // some other form on the page: not ours
      event.preventDefault();
      event.stopImmediatePropagation();
      return show('danger', `<div class="title">Redraft couldn't read this comment box</div><div class="reason">So it can't check the comment, and won't let it post unchecked. The site may have changed its layout — update the extension, or turn it off to post.</div><div class="buttons"><button class="close" data-act="close">Close</button></div>`);
    }
    const text = textOf(editor);
    if (!text) return;

    const ok = cleared.get(composer);
    if (ok && ok.text === text && Date.now() < ok.until) return; // cleared: let the site post it

    // Not cleared: the site never sees this click.
    event.preventDefault();
    event.stopImmediatePropagation();
    check(composer, button || buttonIn(composer), editor, text);
  }

  window.addEventListener('click', (e) => attempt(e, e.composedPath()), true);
  window.addEventListener('submit', (e) => attempt(e, e.composedPath(), true), true);
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) attempt(e, e.composedPath(), true);
    },
    true
  );
})();
