// The app's one moderator instance — the plugin in plugin/, on Nemotron via Token Factory.
// Every model call is logged to logs/llm-calls.jsonl in development (CLAUDE.md: needed for tuning).
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

export function moderator(): Moderator {
  instance ??= createModerator({
    call: withLogging(createNemotron()),
    cleanMax: THRESHOLDS.CLEAN_MAX,
    severeMin: THRESHOLDS.EXTREME_MIN,
  });
  return instance;
}
