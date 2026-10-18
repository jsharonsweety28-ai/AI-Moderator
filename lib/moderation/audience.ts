// AI #2 — audience judgment for a rude comment whose author declined the rewrite.
// Output can never be "public": context tightens, never loosens. On any failure
// we fail closed into human review.
import { matchesScript } from "./lang";
import { chat } from "./llm";
import { extractJsonObject } from "./score";
import { AUDIENCE_SYSTEM_PROMPT } from "./prompts";
import type { RelationshipRow } from "@/lib/db/types";

export type AudienceDecision = {
  decision: "recipient_only" | "collapsed" | "review";
  reason: string;
  viaError: boolean;
};

const DECISIONS = ["recipient_only", "collapsed", "review"] as const;

const FALLBACK_REASONS: Record<AudienceDecision["decision"], string> = {
  recipient_only:
    "You two have a long mutual history of talking like this, so they see it in full. It's collapsed for everyone else.",
  collapsed: "You don't have the kind of mutual history that makes this read as banter, so it's collapsed for everyone.",
  review: "We couldn't decide automatically, so a human moderator will take a look shortly.",
};

async function judgeOnce(user: string): Promise<{ decision: AudienceDecision["decision"]; reason: unknown }> {
  const raw = await chat({
    tag: "audience",
    system: AUDIENCE_SYSTEM_PROMPT,
    user,
    temperature: 0,
    maxTokens: 300,
  });
  const parsed = extractJsonObject(raw) as { decision?: unknown; reason?: unknown };
  if (!DECISIONS.includes(parsed.decision as AudienceDecision["decision"])) {
    throw new Error("invalid audience decision");
  }
  return { decision: parsed.decision as AudienceDecision["decision"], reason: parsed.reason };
}

function describeRelationship(label: string, rel: RelationshipRow | null): string {
  if (!rel) return `${label}: no prior contact on record.`;
  const days = Math.max(0, Math.round((Date.now() - new Date(rel.first_seen).getTime()) / 86_400_000));
  return (
    `${label}: known for ${days} days, messages sent: ${rel.msg_count}, ` +
    `reciprocity: ${rel.reciprocity.toFixed(2)}, ` +
    `typical roughness of these messages: ${rel.rough_baseline.toFixed(2)}, ` +
    `negative reactions received: ${rel.negative_reactions}`
  );
}

export async function judgeAudience(input: {
  text: string;
  score: number;
  category: string;
  commenterToAuthor: RelationshipRow | null;
  authorToCommenter: RelationshipRow | null;
  postTension: number;
}): Promise<AudienceDecision> {
  const user = [
    `COMMENT (already blocked from general view): ${input.text}`,
    `Safety score: ${input.score.toFixed(2)} (category: ${input.category})`,
    describeRelationship("Commenter -> post author", input.commenterToAuthor),
    describeRelationship("Post author -> commenter", input.authorToCommenter),
    `Post tension right now: ${input.postTension.toFixed(2)} (0 = calm, 1 = active pile-on)`,
    `Write the "reason" in the same language and script as the COMMENT above.`,
  ].join("\n");

  try {
    let parsed = await judgeOnce(user);

    // Wrong-language reasons get one retry; the decision is language-independent.
    if (typeof parsed.reason === "string" && !matchesScript(input.text, parsed.reason)) {
      try {
        const retried = await judgeOnce(
          `${user}\nYour previous "reason" was in the wrong language. Write it in the language of the COMMENT.`
        );
        if (typeof retried.reason === "string" && matchesScript(input.text, retried.reason)) {
          parsed = retried;
        } else {
          parsed = { decision: parsed.decision, reason: FALLBACK_REASONS[parsed.decision] };
        }
      } catch {
        parsed = { decision: parsed.decision, reason: FALLBACK_REASONS[parsed.decision] };
      }
    }

    return {
      decision: parsed.decision,
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim() !== ""
          ? parsed.reason.trim()
          : FALLBACK_REASONS[parsed.decision],
      viaError: false,
    };
  } catch {
    return {
      decision: "review",
      reason: "We couldn't decide automatically, so a human moderator will take a look shortly.",
      viaError: true,
    };
  }
}
