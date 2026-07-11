import type { LLMClient } from "./types.js";

export type MockResponder = string | ((prompt: string) => string);

/**
 * Deterministic LLMClient used by every test in this package (and available
 * for offline/local runs). `responder` is either a fixed string returned for
 * every call, or a function of the prompt for tests that need different
 * responses at different call sites (e.g. classify vs. infer-descriptor).
 */
export class MockLLMClient implements LLMClient {
  constructor(private readonly responder: MockResponder) {}

  async complete(prompt: string): Promise<string> {
    return typeof this.responder === "function" ? this.responder(prompt) : this.responder;
  }
}
