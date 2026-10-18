// Classifier evaluation: runs the labeled set through AI #1, reports a confusion
// matrix, and grid-searches CLEAN_MAX / EXTREME_MIN for the best cut points.
// Run with: npm run eval
import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { THRESHOLDS, type Tier } from "@/lib/config";
import { scoreComment } from "@/lib/moderation/score";
import { EVAL_SET, type EvalCase } from "./eval-set";

const CONCURRENCY = 2; // gentle on the per-minute rate limit; cached cases cost nothing anyway
const TIERS: Tier[] = ["clean", "rude", "extreme"];

type CaseResult = EvalCase & {
  score: number | null;
  category: string | null;
  reason: string | null;
  tier: Tier | null;
  target: string | null;
  pass: boolean;
  error?: string;
};

function tierFor(score: number, cleanMax: number, extremeMin: number): Tier {
  if (score < cleanMax) return "clean";
  if (score >= extremeMin) return "extreme";
  return "rude";
}

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

async function runCase(c: EvalCase): Promise<CaseResult> {
  let result = await scoreComment(c.text);
  if (!result.ok) result = await scoreComment(c.text); // one retry for transient failures
  if (!result.ok) {
    return { ...c, score: null, category: null, reason: null, tier: null, target: null, pass: false, error: result.error };
  }
  return {
    ...c,
    score: result.score,
    category: result.category,
    reason: result.reason,
    tier: result.tier,
    target: result.target,
    pass: c.accept.includes(result.tier),
  };
}

async function main() {
const started = Date.now();
const results = await pool(EVAL_SET, CONCURRENCY, runCase);

// ---- per-case table ----
console.log("\nid   | expected        | got     | score | category    | pass");
console.log("-----|-----------------|---------|-------|-------------|-----");
for (const r of results) {
  const exp = r.accept.join("/").padEnd(15);
  const got = (r.tier ?? "ERROR").padEnd(7);
  const score = r.score === null ? "  -  " : r.score.toFixed(2).padStart(5);
  console.log(`${r.id.padEnd(4)} | ${exp} | ${got} | ${score} | ${(r.category ?? "-").padEnd(11)} | ${r.pass ? "ok" : "MISS"}`);
}

// ---- misses in detail ----
const misses = results.filter((r) => !r.pass);
if (misses.length > 0) {
  console.log("\nMisses:");
  for (const m of misses) {
    console.log(`  ${m.id} [want ${m.accept.join("/")}, got ${m.tier ?? "ERROR"}${m.score !== null ? ` @ ${m.score.toFixed(2)}` : ""}] ${m.text}`);
    if (m.error) console.log(`      error: ${m.error}`);
    if (m.reason) console.log(`      reason: ${m.reason}`);
  }
}

// ---- confusion matrix (first accepted tier = canonical expectation) ----
console.log("\nConfusion (rows: expected, cols: got):");
console.log("          clean  rude  extreme  error");
for (const exp of TIERS) {
  const row = results.filter((r) => r.accept[0] === exp);
  const counts = TIERS.map((got) => row.filter((r) => r.tier === got).length);
  const errs = row.filter((r) => r.tier === null).length;
  console.log(`${exp.padEnd(8)} ${counts.map((c) => String(c).padStart(6)).join("")}${String(errs).padStart(8)}`);
}

// ---- target checks (soft: reported, not counted against tier accuracy) ----
const targetChecked = results.filter((r) => r.expectTarget && r.target !== null);
const targetMisses = targetChecked.filter((r) => r.target !== r.expectTarget);
if (targetChecked.length > 0) {
  console.log(`\nTarget checks: ${targetChecked.length - targetMisses.length}/${targetChecked.length} match`);
  for (const m of targetMisses) {
    console.log(`  ${m.id} want target=${m.expectTarget}, got ${m.target}: ${m.text}`);
  }
}

const scored = results.filter((r) => r.score !== null);
const accuracy = results.filter((r) => r.pass).length / results.length;
console.log(`\nAccuracy: ${(accuracy * 100).toFixed(1)}% (${results.filter((r) => r.pass).length}/${results.length})`);
console.log(`Errors (failed closed): ${results.length - scored.length}`);
console.log(`Wall time: ${((Date.now() - started) / 1000).toFixed(1)}s`);

// ---- threshold sweep on the collected scores ----
let best: { cleanMax: number; extremeMin: number; acc: number } = {
  cleanMax: THRESHOLDS.CLEAN_MAX,
  extremeMin: THRESHOLDS.EXTREME_MIN,
  acc: -1,
};
const currentAcc =
  scored.filter((r) => r.accept.includes(tierFor(r.score!, THRESHOLDS.CLEAN_MAX, THRESHOLDS.EXTREME_MIN))).length /
  scored.length;
for (let c = 0.05; c <= 0.8; c += 0.025) {
  for (let e = c + 0.05; e <= 0.95; e += 0.025) {
    const acc = scored.filter((r) => r.accept.includes(tierFor(r.score!, c, e))).length / scored.length;
    if (acc > best.acc) best = { cleanMax: c, extremeMin: e, acc };
  }
}
console.log(`\nThresholds now: CLEAN_MAX=${THRESHOLDS.CLEAN_MAX} EXTREME_MIN=${THRESHOLDS.EXTREME_MIN} -> ${(currentAcc * 100).toFixed(1)}% on scored cases`);
console.log(`Best on this set: CLEAN_MAX=${best.cleanMax.toFixed(3)} EXTREME_MIN=${best.extremeMin.toFixed(3)} -> ${(best.acc * 100).toFixed(1)}%`);

// ---- persist the run for tuning history ----
const logDir = path.join(process.cwd(), "logs");
await mkdir(logDir, { recursive: true });
const file = path.join(logDir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(file, JSON.stringify({ thresholds: THRESHOLDS, accuracy, best, results }, null, 2), "utf8");
console.log(`\nFull results written to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
