// Talks to the Redraft server for the content script. The model key stays on the
// server; the extension only knows the server's address (and an optional shared key).
const DEFAULTS = { apiBase: 'http://localhost:3000', apiKey: '' };
const UNAVAILABLE = "We couldn't check this comment right now, so it hasn't been posted. Please try again in a moment.";

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(['apiBase', 'apiKey'])) };
}

async function call(path, init = {}) {
  const { apiBase, apiKey } = await settings();
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-extension-key'] = apiKey;
  const res = await fetch(apiBase.replace(/\/$/, '') + path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || UNAVAILABLE);
  return data;
}

async function handle(msg) {
  try {
    if (msg.type === 'check') {
      return await call('/api/ext/check', { method: 'POST', body: JSON.stringify({ text: msg.text, site: msg.site, replyingTo: msg.replyingTo }) });
    }
    if (msg.type === 'status') return await call(`/api/ext/status?id=${encodeURIComponent(msg.id)}`);
    if (msg.type === 'peek') return await call('/api/ext/peek', { method: 'POST', body: JSON.stringify({ text: msg.text }) });
    if (msg.type === 'suggest') {
      return await call('/api/ext/suggest', { method: 'POST', body: JSON.stringify({ text: msg.text, replyingTo: msg.replyingTo }) });
    }
    return { error: 'unknown message' };
  } catch (err) {
    // Fail closed: if we can't check, the comment is not allowed.
    return msg.type === 'check'
      ? { allowed: false, verdict: 'unavailable', reason: err.message || UNAVAILABLE, suggestion: null }
      : { status: 'unknown', error: err.message };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse);
  return true; // keeps the channel open for the async answer
});
