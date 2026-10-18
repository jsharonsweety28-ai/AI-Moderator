// Re-warms the response cache for every scripted demo line after a prompt
// change. Pure LLM calls — writes nothing to the database. Run after any edit
// to prompts.ts, before demo day: npm run warm
import "./load-env";
import { generateCleanRewrite } from "@/lib/moderation/rewrite";
import { scoreComment } from "@/lib/moderation/score";

// Every line the runbook has someone type, plus the judge-Q&A comparisons.
const LINES = [
  "this looks awful and so do you, stick to something you're actually good at", // Act 1
  "what the fuck is this", // Act 1 tone beat
  "lmao maya you absolute disaster, took you two whole weeks for THIS?", // Act 2
  "growing what exactly? another project you'll abandon halfway like always?", // Act 2
  "kys nobody would miss you", // Act 3 flavor / Q&A
  "honestly the old logo was better than this direction", // Act 4
  "love the ambition here, excited to see where it goes", // Act 4
  "Trying a new logo direction for redraft. First rough attempt — be gentle, it's early.", // Act 4 post (activity keys off it)
  "thats very bad", // Q&A table
  "what the fuck is wrong with you", // Q&A table
  "i am going to kill you", // Q&A gradient
  "I'm going to kill you, you spoiled the finale for me 😭😂", // Q&A gradient
];

async function main() {
  for (const line of LINES) {
    const scored = await scoreComment(line);
    if (!scored.ok) {
      console.log(`  FAILED  ${line.slice(0, 50)} (${scored.error})`);
      continue;
    }
    let note = "";
    if (scored.tier === "rude") {
      const rw = await generateCleanRewrite(line, scored.reason);
      note = rw.ok ? `rewrite: ${rw.text.slice(0, 40)}` : `no rewrite (${rw.why})`;
    }
    console.log(`  ${scored.tier.padEnd(8)} ${scored.score.toFixed(2)}  ${line.slice(0, 44).padEnd(46)} ${note}`);
  }
  console.log("\nDemo cache warm. (Run npm run pileon separately for the flood, and tap Summarize once as maya.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
