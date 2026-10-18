export type Verdict = "clean" | "rude" | "severe" | "unavailable";

export type ModerationResult = {
  /** Post the comment only when this is true. */
  allowed: boolean;
  verdict: Verdict;
  score: number | null;
  category: string | null;
  /** Plain-language reason shown to the writer. For severe: what is wrong, why, and what to say instead. */
  reason: string;
  /** A checked, safe rewrite for rude comments; null otherwise. */
  suggestion: string | null;
};

export type ChatMessage = { role: "system" | "user"; content: string };
export type ModelCall = (messages: ChatMessage[], maxTokens: number) => Promise<string>;

export type ModeratorOptions = {
  call?: ModelCall;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  cleanMax?: number;
  severeMin?: number;
};

export type Moderator = {
  moderate(text: string, options?: { replyingTo?: string; suggest?: boolean }): Promise<ModerationResult>;
  score(text: string): Promise<{ score: number; category: string; reason: string }>;
  inspectDraft(text: string): { hint: "threat" | "check" | null; message: string | null };
};

export function createModerator(options?: ModeratorOptions): Moderator;
export function inspectDraft(text: string): { hint: "threat" | "check" | null; message: string | null };
export function redact(text: string): string;
export function createNemotron(options?: { apiKey?: string; baseUrl?: string; model?: string; timeoutMs?: number }): ModelCall;
export function parseJson(text: string): unknown;

export class ModeratorError extends Error {
  status: number;
}
export function createModeratorService(options?: {
  moderator?: Moderator;
  decisions?: unknown[];
  persist?: (item: unknown, decisions: unknown[]) => Promise<string>;
  limit?: number;
}): unknown;
export function moderatorHandler(
  service?: unknown,
  options?: { base?: string; secret?: string | null; perMinute?: number }
): (req: unknown, res: unknown, next?: () => void) => Promise<void>;
