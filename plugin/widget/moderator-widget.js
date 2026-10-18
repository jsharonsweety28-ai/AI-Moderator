// Drop-in comment-moderator box. Plain script, no build step:
//   <link rel="stylesheet" href="moderator-widget.css"><script src="moderator-widget.js"></script>
//   AIModerator.mount(document.querySelector('#box'), { endpoint: '/api/plugin' });
// Talks to the routes from moderatorHandler() (src/service.mjs).
(function () {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const TITLES = {
    clean: 'Looks good — ready to post',
    rude: "Not posted yet — here's another way to say it",
    severe: "Can't be posted",
    unsure: 'A person will check this',
    unavailable: "Couldn't check right now",
  };

  // options.onAllowed(text): called when the comment is cleared to post (checked clean, or a suggestion accepted).
  function mount(target, { endpoint = '/api/plugin', replyingTo = null, placeholder = 'Write a comment…', checkDelay = 1800, onAllowed = null } = {}) {
    target.classList.add('aim');
    target.innerHTML = `<label class="aim-sr-only" for="aimDraft">Comment</label>
      <textarea class="aim-draft" id="aimDraft" maxlength="2000" placeholder="${esc(placeholder)}"></textarea>
      <div class="aim-hint" role="status"></div>
      <div class="aim-actions"><button type="button" class="aim-check">Check</button></div>
      <div class="aim-result" role="status"></div>`;
    const $ = sel => target.querySelector(sel);
    const draft = $('.aim-draft'), button = $('.aim-check'), hint = $('.aim-hint'), box = $('.aim-result');
    let hintTimer, checkTimer, revision = 0, inFlight = false, lastChecked = '';

    async function post(action, body) {
      const response = await fetch(endpoint + '/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The moderator is unavailable.');
      return data;
    }

    function show(result) {
      box.dataset.verdict = result.verdict;
      box.innerHTML = `<strong>${esc(TITLES[result.verdict] || result.verdict)}</strong>`
        + (result.verdict !== 'clean' ? `<p>${esc(result.reason)}</p>` : '')
        + (result.suggestion ? `<blockquote>${esc(result.suggestion)}</blockquote>` : '')
        + '<div class="aim-buttons">'
        + (result.suggestion ? '<button type="button" class="aim-accept">Use this</button>' : '')
        + (result.verdict === 'rude' || result.verdict === 'severe' ? '<button type="button" class="aim-edit aim-secondary">Edit it myself</button>' : '')
        + '</div>';
      $('.aim-accept')?.addEventListener('click', async () => {
        try {
          const r = await post('accept', { id: result.id });
          draft.value = r.text; lastChecked = r.text; revision++;
          box.dataset.verdict = 'clean'; box.innerHTML = `<strong>${esc(TITLES.clean)}</strong>`;
          onAllowed?.(r.text);
        } catch (error) { box.insertAdjacentHTML('beforeend', `<p>${esc(error.message)}</p>`); }
      });
      $('.aim-edit')?.addEventListener('click', () => { draft.focus(); draft.setSelectionRange(draft.value.length, draft.value.length); });
      if (result.allowed) onAllowed?.(draft.value.trim());
    }

    async function check() {
      clearTimeout(checkTimer);
      const text = draft.value.trim(), version = revision;
      if (!text || text === lastChecked) return;
      if (inFlight) { checkTimer = setTimeout(check, 1200); return; }
      inFlight = true; button.disabled = true; button.textContent = 'Checking…';
      try {
        const result = await post('check', { text, replyingTo });
        lastChecked = text;
        if (version === revision) show(result);
      } catch (error) {
        if (version === revision) show({ verdict: 'unavailable', reason: error.message, allowed: false });
      } finally {
        inFlight = false; button.disabled = false; button.textContent = 'Check';
      }
    }

    draft.addEventListener('input', () => {
      revision++; const version = revision, text = draft.value.trim();
      clearTimeout(hintTimer); clearTimeout(checkTimer);
      box.textContent = ''; delete box.dataset.verdict;
      if (!text) { hint.textContent = ''; return; }
      // Instant local hint while typing; the real check runs after a pause.
      hintTimer = setTimeout(async () => {
        try { const r = await post('preview', { text }); if (version === revision) hint.textContent = r.message || ''; } catch { /* hint only */ }
      }, 200);
      checkTimer = setTimeout(check, checkDelay);
    });
    button.addEventListener('click', () => { lastChecked = ''; check(); });
    return { get value() { return draft.value; }, set value(text) { draft.value = text; draft.dispatchEvent(new Event('input')); }, check };
  }

  globalThis.AIModerator = { mount };
})();
