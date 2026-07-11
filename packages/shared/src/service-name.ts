/**
 * Single source of truth for the service name shown to end users (tool
 * descriptions, dashboard UI, generated server metadata). Every reference to
 * the service name elsewhere in the codebase must import this constant
 * rather than hardcoding the string, so a future rename only touches one
 * file and stays auditable against the forbidden-substring check below.
 */
export const SERVICE_NAME = "MCP Foundry(엠씨피 파운드리)";
