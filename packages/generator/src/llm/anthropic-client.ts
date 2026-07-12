import Anthropic from "@anthropic-ai/sdk";
import type { LLMClient } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

/** Production LLMClient. Never imported by tests — see MockLLMClient. */
export class AnthropicLLMClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string = process.env.GENERATOR_MODEL ?? DEFAULT_MODEL) {
    if (!apiKey) {
      throw new Error("AnthropicLLMClient requires a non-empty apiKey (set ANTHROPIC_API_KEY)");
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content.find((entry) => entry.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("AnthropicLLMClient: response contained no text content block");
    }
    return block.text;
  }
}
