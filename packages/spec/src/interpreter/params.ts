import type { ParamProperty, ToolSpec } from "../schema/index.js";
import type { LoadSpecResult } from "./types.js";

function describeType(property: ParamProperty, value: unknown): string | null {
  switch (property.type) {
    case "string":
      return typeof value === "string" ? null : "expected a string";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "expected a finite number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value) ? null : "expected an integer";
    case "boolean":
      return typeof value === "boolean" ? null : "expected a boolean";
    default:
      return "unknown parameter type";
  }
}

function checkParam(name: string, property: ParamProperty, value: unknown): string | null {
  const typeError = describeType(property, value);
  if (typeError !== null) {
    return `parameter "${name}" ${typeError}`;
  }
  if (property.enum !== undefined && !property.enum.includes(value as string | number)) {
    return `parameter "${name}" must be one of: ${property.enum.join(", ")}`;
  }
  return null;
}

/**
 * Validates untrusted tool-call arguments against the tool's declared
 * inputSchema. additionalProperties is always treated as false regardless
 * of the raw payload shape — this is the runtime half of the "허용 필드
 * 화이트리스트" gate (the schema-level half rejects any spec that tries to
 * declare additionalProperties: true at load time).
 */
export function validateToolArgs(
  tool: ToolSpec,
  rawArgs: unknown,
): LoadSpecResult<Record<string, unknown>> {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, errors: ["arguments must be a JSON object"] };
  }

  const args = rawArgs as Record<string, unknown>;
  const properties = tool.inputSchema.properties;
  const errors: string[] = [];

  for (const key of Object.keys(args)) {
    if (!(key in properties)) {
      errors.push(`unexpected parameter "${key}"`);
    }
  }

  for (const required of tool.inputSchema.required) {
    if (!(required in args)) {
      errors.push(`missing required parameter "${required}"`);
    }
  }

  for (const [name, property] of Object.entries(properties)) {
    if (!(name in args)) continue;
    const error = checkParam(name, property, args[name]);
    if (error !== null) errors.push(error);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: args };
}
