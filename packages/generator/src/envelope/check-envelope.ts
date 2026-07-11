import type { GenerateRequest } from "../types.js";

export type EnvelopeCheck = { withinEnvelope: true } | { withinEnvelope: false; reason: string };

// Plan R7: the DSL can only express "HTTP wrap + parameter mapping +
// response field selection/markdown formatting" — no branching, loops, or
// chained/dependent multi-step calls. This is a conservative keyword
// heuristic pre-check on the raw request; genuine ambiguous cases still
// get a real shot via template matching / HTTP-wrapper fallback and can
// fail there too (see generate.ts's second R7 checkpoint after validation).
const ENVELOPE_EXCEEDING_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bif\b.{0,40}\bthen\b/i, reason: "conditional branching (\"if ... then\")" },
  // "만약/라면" (if/if-so) and the common "-(으)면" conditional verb ending
  // (e.g. "넘으면" = "if it exceeds"), guarded to whitespace/end/comma so it
  // doesn't fire on ordinary nouns that happen to end in "면" (e.g. "화면").
  { pattern: /만약|라면|[가-힣]{1,10}(으)?면(\s|,|$)/, reason: "conditional branching (조건문)" },
  { pattern: /\bfor each\b|\brepeat\b|\bloop\b/i, reason: "iteration/looping" },
  { pattern: /(각각에 대해|반복해서|모든.{0,10}대해)/, reason: "iteration/looping (반복문)" },
  { pattern: /\bwhile\b/i, reason: "iteration (while loop)" },
  { pattern: /(then (use|call) (the|that)|chain(ed)? api calls|multi-?step)/i, reason: "chained/dependent multi-step API calls" },
  { pattern: /(체이닝|여러\s*단계로|단계별로.{0,10}호출)/, reason: "chained/dependent multi-step API calls (체이닝)" },
];

export function checkEnvelope(request: GenerateRequest): EnvelopeCheck {
  const auth = request.endpointDescriptor?.auth;
  if (auth && auth.type !== "none") {
    return {
      withinEnvelope: false,
      reason: `the v1 DSL cannot call an authenticated upstream API (auth type "${auth.type}") — it has no mechanism to store or forward a secret safely`,
    };
  }

  const match = ENVELOPE_EXCEEDING_PATTERNS.find(({ pattern }) => pattern.test(request.nl));
  if (match) {
    return {
      withinEnvelope: false,
      reason: `the request appears to need ${match.reason}, which the DSL cannot express (only HTTP wrapping + parameter mapping + response formatting — no branching/loops/multi-step chaining)`,
    };
  }

  return { withinEnvelope: true };
}
