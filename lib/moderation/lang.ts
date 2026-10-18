// Cheap script detection. Models sometimes answer in the wrong language regardless of
// prompt instructions; callers compare the dominant script of input and output and
// retry once with an explicit directive when they differ. (Code job, not LLM job.)

type Script = "latin" | "cyrillic" | "cjk" | "devanagari" | "arabic" | "other";

const RANGES: Array<[Script, RegExp]> = [
  ["latin", /[a-zA-ZÀ-ɏ]/g],
  ["cyrillic", /[Ѐ-ӿ]/g],
  ["cjk", /[぀-ヿ㐀-鿿가-힯]/g],
  ["devanagari", /[ऀ-ॿ]/g],
  ["arabic", /[؀-ۿ]/g],
];

export function dominantScript(text: string): Script {
  let best: Script = "other";
  let bestCount = 0;
  for (const [script, re] of RANGES) {
    const count = (text.match(re) ?? []).length;
    if (count > bestCount) {
      best = script;
      bestCount = count;
    }
  }
  return best;
}

/** True when `output` is written in the same script as `input` (or input has no letters at all). */
export function matchesScript(input: string, output: string): boolean {
  const inScript = dominantScript(input);
  if (inScript === "other") return true;
  return dominantScript(output) === inScript;
}
