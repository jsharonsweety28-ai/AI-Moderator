// Chat client for NVIDIA Nemotron on Nebius Token Factory (any OpenAI-compatible
// API works). Any function with the same shape — call(messages, maxTokens) → string —
// can replace it via createModerator({ call }).
export function createNemotron({
  apiKey = process.env.NEBIUS_API_KEY,
  baseUrl = process.env.LLM_BASE_URL || 'https://api.tokenfactory.nebius.com/v1',
  model = process.env.LLM_MODEL || 'nvidia/Nemotron-3-Ultra-550b-a55b',
  timeoutMs = 20000,
} = {}) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  return async function call(messages, maxTokens = 400) {
    if (!apiKey) throw new Error('The moderator model is not configured. Set NEBIUS_API_KEY.');
    let response;
    // Rate limits (429) and server hiccups (5xx) get two backoff retries.
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch(url, {
          method: 'POST', signal: AbortSignal.timeout(timeoutMs),
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          // Reasoning off and temperature 0: these are short classification and
          // rewriting calls, and with reasoning on the model sometimes answers the
          // comment instead of judging it.
          body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens, chat_template_kwargs: { enable_thinking: false } }),
        });
      } catch { throw new Error('The moderator model could not be reached.'); }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      break;
    }
    if (!response.ok) throw new Error(`The moderator model returned HTTP ${response.status}.`);
    const data = await response.json().catch(() => ({}));
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('The moderator model returned no answer.');
    return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  };
}

// Pulls the first JSON object out of a model reply, tolerating code fences and prose around it.
export function parseJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in the model reply.');
  return JSON.parse(cleaned.slice(start, end + 1));
}
