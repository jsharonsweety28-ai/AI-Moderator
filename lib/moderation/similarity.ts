// LLM job 4: are these N comments the same message reworded? Returns 0 on any
// failure — a missing signal never fires the detector (no false pile-ons from a
// flaky model; genuinely severe comments are already blocked individually).
import { chat } from "./llm";
import { extractJsonObject } from "./score";
import { SIMILARITY_SYSTEM_PROMPT } from "./prompts";

export async function checkSimilarity(bodies: string[]): Promise<number> {
  if (bodies.length < 2) return 0;
  // Sorted + truncated for a stable cache key across reruns of the same burst.
  const list = [...bodies]
    .map((b) => b.slice(0, 120))
    .sort()
    .map((b, i) => `${i + 1}. ${b}`)
    .join("\n");
  try {
    const raw = await chat({
      tag: "similarity",
      system: SIMILARITY_SYSTEM_PROMPT,
      user: list,
      temperature: 0,
      maxTokens: 100,
    });
    const parsed = extractJsonObject(raw) as { similarity?: unknown };
    if (typeof parsed.similarity !== "number" || Number.isNaN(parsed.similarity)) return 0;
    return Math.min(1, Math.max(0, parsed.similarity));
  } catch {
    return 0;
  }
}
