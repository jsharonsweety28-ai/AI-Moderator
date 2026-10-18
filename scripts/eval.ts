// Classifier evaluation: runs the labelled set through the plugin's moderator
// (verdict only, no rewrites) and reports accuracy, misses and severe coverage.
// Run with: npm run eval      (LLM_MODEL=... to try another model)
import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { THRESHOLDS } from "@/lib/config";
import { createModerator, type ModerationResult } from "@/plugin/src/index.mjs";
import { EVAL_SET, type EvalCase } from "./eval-set";

const CONCURRENCY = 2;
// The eval set's tier names, mapped from the plugin's verdicts.
const TIER: Record<ModerationResult["verdict"], string> = { clean: "clean", rude: "rude", severe: "extreme", unsure: "person", unavailable: "error" };

const moderator = createModerator({ cleanMax: THRESHOLDS.CLEAN_MAX, severeMin: THRESHOLDS.EXTREME_MIN, unsureMin: THRESHOLDS.UNSURE_MIN });

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

type Row = EvalCase & { got: string; score: number | null; reason: string; pass: boolean };

async function main() {
  const started = Date.now();
  const rows = await pool(EVAL_SET, CONCURRENCY, async (c): Promise<Row> => {
    let r = await moderator.moderate(c.text, { suggest: false });
    if (r.verdict === "unavailable") r = await moderator.moderate(c.text, { suggest: false }); // one retry
    const got = TIER[r.verdict];
    // Sending an unreadable comment to a person is a safe outcome — except for severe ones,
    // which must always be caught.
    const deferredSafely = got === "person" && !(c.accept as string[]).includes("extreme");
    return { ...c, got, score: r.score, reason: r.reason, pass: (c.accept as string[]).includes(got) || deferredSafely };
  });

  console.log("\nid   | expected        | got     | score | pass");
  console.log("-----|-----------------|---------|-------|-----");
  for (const r of rows) {
    console.log(`${r.id.padEnd(4)} | ${r.accept.join("/").padEnd(15)} | ${r.got.padEnd(7)} | ${r.score === null ? "  -  " : r.score.toFixed(2).padStart(5)} | ${r.pass ? "ok" : "MISS"}`);
  }

  const misses = rows.filter((r) => !r.pass);
  if (misses.length) {
    console.log("\nMisses:");
    for (const r of misses) console.log(`  ${r.id} [want ${r.accept.join("/")}, got ${r.got}] ${r.text}\n      reason: ${r.reason}`);
  }

  const severe = rows.filter((r) => r.accept.length === 1 && r.accept[0] === "extreme");
  const pass = rows.filter((r) => r.pass).length;
  console.log(`\nAccuracy: ${((100 * pass) / rows.length).toFixed(1)}% (${pass}/${rows.length})`);
  console.log(`Severe caught: ${severe.filter((r) => r.got === "extreme").length}/${severe.length}`);
  console.log(`Sent to a person (AI unsure): ${rows.filter((r) => r.got === "person").map((r) => r.id).join(", ") || "none"}`);
  console.log(`Errors (failed closed): ${rows.filter((r) => r.got === "error").length}`);
  console.log(`Wall time: ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const dir = path.join(process.cwd(), "logs");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify({ model: process.env.LLM_MODEL ?? "default", rows }, null, 2));
  console.log(`Full results written to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
