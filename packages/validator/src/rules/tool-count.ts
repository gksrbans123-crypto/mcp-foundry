import type { ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Plan §8: 3-10 recommended, <3 is a violation the generator may recover
// from by auto-augmenting (adding a related lookup/help tool), >20 is a
// hard block with no recovery path. 3-20 all pass this rule.
const MIN_RECOMMENDED_TOOLS = 3;
const MAX_TOOLS = 20;

export function checkToolCount(spec: ServerSpec): RuleViolation[] {
  const count = spec.tools.length;

  if (count > MAX_TOOLS) {
    return [{ rule: "tool-count", message: `${count} tools exceeds the hard cap of ${MAX_TOOLS}` }];
  }

  if (count < MIN_RECOMMENDED_TOOLS) {
    return [
      {
        rule: "tool-count",
        message: `${count} tool(s) is below the recommended minimum of ${MIN_RECOMMENDED_TOOLS}`,
        hint: "auto-augment: add related lookup/help tool(s) to reach the minimum before rejecting outright",
      },
    ];
  }

  return [];
}
