// LLMs frequently wrap JSON in markdown code fences despite instructions
// not to — strip a single leading/trailing ``` fence (with optional
// language tag) before parsing, but never attempt to "fix" malformed JSON.
export function parseJsonLoosely(raw: string): unknown | null {
  const fenced = raw.trim().replace(/^```[A-Za-z]*\n?/, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(fenced);
  } catch {
    return null;
  }
}
