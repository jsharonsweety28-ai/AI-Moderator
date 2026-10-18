// No network: the model is a stub. Run with `npm test` inside plugin/.
import assert from 'node:assert/strict';
import http from 'node:http';
import { inspectDraft, createModerator, createModeratorService, moderatorHandler, parseJson, redact } from '../src/index.mjs';

// A stub model: scores come from a lookup table; rewrites/meaning checks from simple rules.
function stubModel({ scores, rewrite = 'I strongly disagree with this.', faithful = true, chatty = false, unsure = [] }) {
  return async (messages) => {
    const system = messages[0].content, user = messages[1].content;
    if (system.includes('content-safety scorer')) {
      const text = user.split('\n\n(')[0];
      const s = scores[text] ?? 0.05;
      const unsureText = (unsure || []).includes(text);
      const json = JSON.stringify({ meaning: unsureText ? 'not sure' : '', sure: !unsureText, score: s, category: s >= 0.85 ? 'threat' : s >= 0.4 ? 'insult' : 'clean', reason: s >= 0.85 ? 'This threatens someone. Threats make people afraid. Say what upset you instead.' : 'Plain reason.' });
      return chatty ? `Sure! Here is my verdict: ${json} Hope that helps.` : json;
    }
    if (system.includes('proposed civil rewrite')) return JSON.stringify({ faithful });
    return JSON.stringify({ rewrite: typeof rewrite === 'function' ? rewrite(user) : rewrite });
  };
}

// --- typing hint: escalates, never allows ---
assert.equal(inspectDraft('I will kill him').hint, 'threat');
assert.equal(inspectDraft("I'll end you").hint, 'threat');
assert.notEqual(inspectDraft('I will not kill him').hint, 'threat');
assert.notEqual(inspectDraft('He said "I will kill you" in the trailer').hint, 'threat');
assert.equal(inspectDraft('The character said nothing, I will kill you').hint, 'threat', 'no "character" loophole');
assert.equal(inspectDraft('you are a moron').hint, 'check');
assert.equal(inspectDraft('உன்னை கொன்னுடுவேன்').hint, 'threat', 'Tamil threat');
assert.equal(inspectDraft('unna kolla poren').hint, 'threat', 'Tanglish threat');
assert.equal(inspectDraft('tujhe jaan se maar dunga').hint, 'threat', 'Hinglish threat');
assert.equal(inspectDraft('enakku idhu pudikala').hint, null, 'harmless Tanglish');
assert.equal(inspectDraft('Lovely weather today').hint, null);

// --- forgiving JSON + privacy masking ---
assert.deepEqual(parseJson('Here you go: {"a": 1} thanks'), { a: 1 });
assert.equal(redact('mail me at a.b@c.com or +91 98765 43210'), 'mail me at [EMAIL] or [PHONE]');

// --- clean posts ---
const m = createModerator({ call: stubModel({ scores: { 'you are an idiot': 0.55, 'I will hurt you': 0.95 } }) });
let r = await m.moderate('Great post!');
assert.equal(r.verdict, 'clean'); assert.equal(r.allowed, true); assert.equal(r.suggestion, null);

// --- rude: not allowed, checked suggestion offered ---
r = await m.moderate('you are an idiot');
assert.equal(r.verdict, 'rude'); assert.equal(r.allowed, false); assert.equal(r.suggestion, 'I strongly disagree with this.');

// --- severe: not allowed, explanation, NO AI rewrite ---
r = await m.moderate('I will hurt you');
assert.equal(r.verdict, 'severe'); assert.equal(r.allowed, false); assert.equal(r.suggestion, null);
assert.match(r.reason, /instead/);

// --- a threat the model under-scores is still severe (hint escalates) ---
const optimistic = createModerator({ call: stubModel({ scores: { 'I will kill him': 0.1 } }) });
assert.equal((await optimistic.moderate('I will kill him')).verdict, 'severe');

// --- chatty model replies still parse ---
const chatty = createModerator({ call: stubModel({ scores: { 'you are an idiot': 0.55 }, chatty: true }) });
assert.equal((await chatty.moderate('you are an idiot')).verdict, 'rude');

// --- unsure about a non-English comment → a person decides (not posted, no guess) ---
const unsureModel = createModerator({ call: stubModel({ scores: { 'enna idhu da': 0.1, 'poda dei': 0.95 }, unsure: ['enna idhu da', 'poda dei'] }) });
r = await unsureModel.moderate('enna idhu da');
assert.equal(r.verdict, 'unsure'); assert.equal(r.allowed, false); assert.equal(r.suggestion, null);
assert.equal((await unsureModel.moderate('poda dei')).verdict, 'severe', 'severe still wins over unsure');
const englishUnsure = createModerator({ call: async (m) => m[0].content.includes('content-safety') ? '{"meaning":"","sure":false,"score":0.1,"category":"clean","reason":"ok"}' : '{}' });
assert.equal((await englishUnsure.moderate('nice post')).verdict, 'clean', 'English is never unsure');
const borderline = createModerator({ call: async (m) => m[0].content.includes('content-safety') ? '{"meaning":"why do you even get this job","sure":true,"score":0.35,"category":"clean","reason":"ok"}' : '{}' });
assert.equal((await borderline.moderate('unakku ellam edhuku da indha velai')).verdict, 'unsure', 'non-English near the line goes to a person');
const englishBorderline = createModerator({ call: async (m) => m[0].content.includes('content-safety') ? '{"meaning":"","sure":true,"score":0.35,"category":"clean","reason":"ok"}' : '{}' });
assert.equal((await englishBorderline.moderate('you clearly did not test this')).verdict, 'clean', 'English near the line still posts');

// --- fail closed: model down → not allowed ---
const offline = createModerator({ call: async () => { throw new Error('down'); } });
r = await offline.moderate('kys');
assert.equal(r.verdict, 'unavailable'); assert.equal(r.allowed, false);

// --- a failed rewrite never discards the verdict ---
let calls = 0;
const flaky = createModerator({ call: async (msgs) => {
  if (msgs[0].content.includes('content-safety scorer')) return '{"score":0.55,"category":"insult","reason":"x"}';
  calls++; throw new Error('rewrite step down');
} });
r = await flaky.moderate('you are an idiot');
assert.equal(r.verdict, 'rude'); assert.equal(r.allowed, false); assert.equal(r.suggestion, null); assert.ok(calls >= 1);

// --- suggestion gates: wrong language or changed meaning is never offered ---
const english = createModerator({ call: stubModel({ scores: { 'तुम बेवकूफ हो': 0.55 }, rewrite: 'I disagree.' }) });
assert.equal((await english.moderate('तुम बेवकूफ हो')).suggestion, null, 'Hindi in must not get English out');
const tamil = createModerator({ call: stubModel({ scores: { 'நீ ஒரு முட்டாள்': 0.55 }, rewrite: 'I disagree.' }) });
assert.equal((await tamil.moderate('நீ ஒரு முட்டாள்')).suggestion, null, 'Tamil in must not get English out');
const unfaithful = createModerator({ call: stubModel({ scores: { 'you are an idiot': 0.55 }, faithful: false }) });
assert.equal((await unfaithful.moderate('you are an idiot')).suggestion, null);

// --- the post being replied to reaches the rewrite prompt ---
let sawPost = false;
const ctx = createModerator({ call: stubModel({ scores: { 'i hate you': 0.45 }, rewrite: u => { sawPost = u.includes('Post being replied to: singing'); return "I'm not a fan of your singing."; } }) });
r = await ctx.moderate('i hate you', { replyingTo: 'singing at an event' });
assert.ok(sawPost); assert.equal(r.suggestion, "I'm not a fan of your singing.");

// --- HTTP routes: preview, check, accept, decisions, secret, rate limit ---
const saved = [];
const service = createModeratorService({ moderator: m, persist: async item => { saved.push(item.id); return 'Test store'; } });
const server = http.createServer(moderatorHandler(service, { base: '/api/plugin', perMinute: 5 })).listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/plugin`;
const post = (action, body, headers = {}) => fetch(`${base}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async res => ({ status: res.status, data: await res.json() }));
try {
  assert.equal((await post('preview', { text: 'I will kill him' })).data.hint, 'threat');
  const checked = await post('check', { text: 'you are an idiot' });
  assert.equal(checked.data.allowed, false);
  assert.equal(checked.data.suggestion, 'I strongly disagree with this.');
  const accepted = await post('accept', { id: checked.data.id });
  assert.equal(accepted.data.text, 'I strongly disagree with this.'); assert.equal(accepted.data.allowed, true);
  assert.equal((await post('check', { text: '' })).status, 400);
  assert.equal((await post('accept', { id: 'missing' })).status, 400);
  const limitedStatus = [];
  for (let i = 0; i < 4; i++) limitedStatus.push((await post('check', { text: 'hello' })).status);
  assert.ok(limitedStatus.includes(429), 'rate limit kicks in');
  const history = await fetch(`${base}/decisions`).then(res => res.json());
  assert.equal(history.decisions.find(d => d.id === checked.data.id).accepted, true);
} finally { server.close(); }

const locked = http.createServer(moderatorHandler(service, { secret: 's3cret' })).listen(0);
try {
  const url = `http://127.0.0.1:${locked.address().port}/api/plugin/preview`;
  assert.equal((await fetch(url, { method: 'POST', body: '{"text":"hi"}' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'x-moderator-key': 's3cret' }, body: '{"text":"hi"}' })).status, 200);
} finally { locked.close(); }

console.log('AI moderator plugin checks passed.');
