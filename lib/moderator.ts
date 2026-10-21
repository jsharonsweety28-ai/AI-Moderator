// The app's one moderator instance — the plugin in plugin/, on Nemotron via Token Factory.
// Every model call is logged to logs/llm-calls.jsonl in development (CLAUDE.md: needed for tuning).
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { THRESHOLDS } from "@/lib/config";
import { createModerator, createNemotron, type ModelCall, type Moderator } from "@/plugin/src/index.mjs";

let instance: Moderator | null = null;

function withLogging(call: ModelCall): ModelCall {
  if (process.env.VERCEL) return call; // read-only filesystem
  const dir = path.join(process.cwd(), "logs");
  return async (messages, maxTokens) => {
    const started = Date.now();
    let output: string | null = null;
    let error: string | undefined;
    try {
      output = await call(messages, maxTokens);
      return output;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const line = JSON.stringify({ at: new Date().toISOString(), ms: Date.now() - started, messages, output, error });
      await mkdir(dir, { recursive: true })
        .then(() => appendFile(path.join(dir, "llm-calls.jsonl"), line + "\n", "utf8"))
        .catch(() => {});
    }
  };
}

// Remembers recent answers: the exact same model question (same prompt, same text) is
// answered from memory instead of being paid for again. The live typing check and the
// Post check ask the same scoring question, so the Post check is usually free.
const CACHE_MAX = 1000;
const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { output: string; at: number }>();
export const modelStats = { calls: 0, cacheHits: 0 };

function withCache(call: ModelCall): ModelCall {
  return async (messages, maxTokens) => {
    const key = createHash("sha256").update(JSON.stringify([messages, maxTokens])).digest("hex");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      modelStats.cacheHits++;
      cache.delete(key); // re-insert: Map order doubles as least-recently-used
      cache.set(key, hit);
      return hit.output;
    }
    modelStats.calls++;
    const output = await call(messages, maxTokens); // failures are never cached
    cache.set(key, { output, at: Date.now() });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return output;
  };
}

export function moderator(): Moderator {
  instance ??= createModerator({
    call: withCache(withLogging(createNemotron())),
    cleanMax: THRESHOLDS.CLEAN_MAX,
    severeMin: THRESHOLDS.EXTREME_MIN,
    unsureMin: THRESHOLDS.UNSURE_MIN,
  });
  return instance;
}
