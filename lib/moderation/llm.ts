// The only place that talks to the model API (NVIDIA Nemotron on Nebius Token
// Factory, OpenAI-compatible). All five LLM jobs go through chat(). (CLAUDE.md)
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SCORING, llmConfig } from "@/lib/config";
import { logLlmCall } from "./log";

export class LlmError extends Error {}

type ChatArgs = {
  /** Short label for logs: "score" | "rewrite" | "audience" | "similarity" | "shield_summary" */
  tag: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

// Disk cache keyed by the full request. Re-asking the same question costs nothing —
// this is the "venue wifi has ended more demos than bad code" insurance. A changed
// prompt or model changes the key, so tuning always busts the cache naturally.
const CACHE_DIR = path.join(process.cwd(), ".llm-cache");
const cacheEnabled = () => process.env.LLM_CACHE !== "off";

function cacheKey(model: string, args: ChatArgs): string {
  return createHash("sha256")
    .update(JSON.stringify([model, args.system, args.user, args.temperature ?? 0]))
    .digest("hex");
}

async function cacheGet(key: string): Promise<string | null> {
  try {
    return await readFile(path.join(CACHE_DIR, key + ".txt"), "utf8");
  } catch {
    return null;
  }
}

async function cachePut(key: string, value: string): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path.join(CACHE_DIR, key + ".txt"), value, "utf8");
  } catch {
    // Cache failures are invisible; the live call already succeeded.
  }
}

/** Reasoning models can prepend a <think> block even when asked not to. Every
 *  caller wants only the answer — and a brace inside the reasoning would
 *  otherwise confuse JSON extraction. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

/**
 * One chat completion, reasoning off, temperature 0 by default.
 * Returns the assistant's text. Throws LlmError on any failure —
 * callers fail closed (the comment stays blocked), never open.
 */
export async function chat(args: ChatArgs): Promise<string> {
  const { apiKey, baseUrl, model, disableThinking } = llmConfig();
  const key = cacheKey(model, args);

  if (cacheEnabled()) {
    const hit = await cacheGet(key);
    if (hit !== null) {
      await logLlmCall({ tag: args.tag, model, system: args.system, user: args.user, output: hit, ms: 0, cached: true });
      return hit;
    }
  }

  const started = Date.now();
  let output: string | null = null;
  try {
    let res!: Response;
    // Rate limits (429) and server hiccups (5xx) get up to two backoff retries —
    // bursts of cached-then-live calls trip per-minute limits otherwise, and a
    // 429 mid-demo must not fail-close a perfectly checkable comment.
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
          temperature: args.temperature ?? 0,
          max_tokens: args.maxTokens ?? 500,
          // Nemotron reasons by default; these are short classification and
          // rewriting calls, so answer directly.
          ...(disableThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
        signal: AbortSignal.timeout(SCORING.LLM_TIMEOUT_MS),
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 2) break;
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new LlmError(`LLM HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const raw = body.choices?.[0]?.message?.content;
    const content = typeof raw === "string" ? stripThinking(raw) : "";
    if (content === "") throw new LlmError("LLM returned no content");
    output = content;
    if (cacheEnabled()) await cachePut(key, content);
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logLlmCall({ tag: args.tag, model, system: args.system, user: args.user, output, ms: Date.now() - started, cached: false, error: msg });
    if (err instanceof LlmError) throw err;
    throw new LlmError(msg);
  } finally {
    if (output !== null) {
      await logLlmCall({ tag: args.tag, model, system: args.system, user: args.user, output, ms: Date.now() - started, cached: false });
    }
  }
}
