import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  // The entire forged-token defense (apps/creator-mcp's SignedOwnerToken
  // AuthN) depends on this HMAC key's strength — 32 chars is a floor, not a
  // target; prefer a random 256-bit+ value (e.g. `openssl rand -base64 32`).
  OWNER_TOKEN_SECRET: z.string().min(32, "OWNER_TOKEN_SECRET must be at least 32 characters (>=256-bit)"),
  PUBLIC_BASE_URL: z.string().url("PUBLIC_BASE_URL must be a valid URL"),
  CREATOR_PORT: z.coerce.number().int().positive().default(3001),
  RUNTIME_PORT: z.coerce.number().int().positive().default(3002),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
  GENERATOR_MODEL: z.string().min(1).default("claude-opus-4-8"),
  // Optional process-wide egress allowlist (comma-separated hostnames). Empty
  // (the default) means "no extra restriction beyond each spec's own declared
  // hosts" — any public host a generated spec targets is reachable, while the
  // SSRF / private-IP / DNS-rebinding guards in each service's guarded-fetch
  // still block internal/metadata addresses regardless of this list.
  EGRESS_ALLOWLIST: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates process env at startup and returns a frozen, typed copy.
 * Throws with a human-readable summary of every missing/invalid variable
 * instead of failing lazily the first time a caller touches process.env.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return Object.freeze(parsed.data);
}
