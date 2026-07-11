/**
 * Seam between the generator and any LLM provider. Every LLM call in this
 * package goes through this interface so the real implementation
 * (AnthropicLLMClient) and the deterministic MockLLMClient are
 * interchangeable — no test needs ANTHROPIC_API_KEY.
 */
export interface LLMClient {
  complete(prompt: string): Promise<string>;
}
