// Log every LLM call's input and output during development — needed for threshold tuning. (CLAUDE.md)
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), "logs");
let dirReady: Promise<void> | null = null;

export async function logLlmCall(entry: {
  tag: string;
  model: string;
  system: string;
  user: string;
  output: string | null;
  ms: number;
  cached: boolean;
  error?: string;
}): Promise<void> {
  try {
    if (!dirReady) dirReady = mkdir(LOG_DIR, { recursive: true }).then(() => undefined);
    await dirReady;
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    await appendFile(path.join(LOG_DIR, "llm-calls.jsonl"), line + "\n", "utf8");
  } catch {
    // Logging must never take down a moderation call.
  }
}
