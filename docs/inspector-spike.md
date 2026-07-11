# Inspector Headless Spike — Decision Document

Status: **RESOLVED — CLI mode adopted.** This closes blocking gate G-B (plan §10 P1, task #6).

## 1. Question

Can `@modelcontextprotocol/inspector` run non-interactively (headless), driven entirely by
exit code / stdout JSON, so it can act as an automated compliance gate inside the worker
pipeline's `validating` stage? Plan §10 mandated a fallback decision tree if not:
CLI → programmatic API → protocol-level self-checker (initialize/tools.list/tools.call +
schema validation).

## 2. Method

Built a throwaway minimal MCP server at `scripts/spike/server.mjs` (not part of the
shipped product): `@modelcontextprotocol/sdk@1.29.0`, stateless Streamable HTTP transport
(`sessionIdGenerator: undefined`), one `echo` tool with all 5 annotation fields, served via
Express at `POST /mcp` on port 3999. Confirmed it correctly answers a raw `initialize`
JSON-RPC call over HTTP before touching Inspector at all.

Then ran `@modelcontextprotocol/inspector@0.22.0` in `--cli` mode against that URL for
four scenarios, capturing stdout, stderr, and exit code for each.

Versions pinned exactly (no `^`): `@modelcontextprotocol/sdk@1.29.0` (spike server),
`@modelcontextprotocol/inspector@0.22.0` (runner). Both were the latest available on npm
at spike time (2026-07-09). Local Node is v20.20.2; Inspector's own `package.json`
declares `engines.node >= 22.7.5` — this produced an `EBADENGINE` warning on stderr but
**did not prevent execution or affect stdout/exit code** in any trial.

## 3. Commands run and results

### 3.1 `tools/list` — happy path

```
npx --yes @modelcontextprotocol/inspector@0.22.0 --cli http://localhost:3999/mcp \
  --transport http --method tools/list
```
- **Exit code: 0**
- stdout: pretty-printed JSON, top-level `{ "tools": [ ... ] }`, each tool carrying
  `name`, `description`, `inputSchema` (JSON Schema, draft-07), `annotations`, and an
  `execution.taskSupport` field.
- stderr: only npm engine/deprecation warnings, no protocol-relevant content.

### 3.2 `tools/call` — happy path

```
... --method tools/call --tool-name echo --tool-arg text=hello
```
- **Exit code: 0**
- stdout: `{ "content": [ { "type": "text", "text": "echo: hello" } ] }`

### 3.3 `tools/call` — invalid tool name (**key finding**)

```
... --method tools/call --tool-name nonexistent_tool --tool-arg text=hello
```
- **Exit code: 0** ← still zero
- stdout: `{ "content": [ { "type": "text", "text": "MCP error -32602: Tool nonexistent_tool not found" } ], "isError": true }`
- stderr: empty

**Exit code does not reflect tool-level/protocol-level errors.** Inspector CLI treats a
successful round trip that *carries* an MCP error response as a successful CLI
invocation. Any gate built on exit code alone would silently pass a broken tool.

### 3.4 `tools/list` against an unreachable server

```
npx --yes @modelcontextprotocol/inspector@0.22.0 --cli http://localhost:9999/mcp \
  --transport http --method tools/list
```
- **Exit code: 1**
- stdout: empty
- stderr: `Failed to connect to MCP server: fetch failed` / `Failed with exit code: 1`

Only transport-level failures (connection refused, timeout) produce a non-zero exit.

## 4. Decision

**Adopt Inspector CLI headless mode as the primary (and, per the fallback tree, only
necessary) mechanism.** The programmatic-API and protocol-level self-checker fallbacks
are not implemented — CLI mode is fully viable and is simpler to maintain. The decision
tree stops at level 1:

```
CLI headless? → YES (proven above) → adopt CLI, stop.
   (unreached) NO → try programmatic API
   (unreached) NO → build protocol-level self-checker
```

If a future Inspector release regresses headless support, the next escalation step is
the programmatic API (`@modelcontextprotocol/inspector`'s internal client library, not
yet evaluated), then the protocol-level self-checker described in plan §10 — a raw
`initialize` → `tools/list` → `tools/call` JSON-RPC client with local schema validation,
which is fully specified enough to build in under a day if ever needed.

### Binding contract for the runner (`packages/validator/src/inspector-runner.ts`)

Because of finding 3.3, the runner **must not** treat `exitCode === 0` as `passed: true`:
1. Non-zero exit code → hard failure (connectivity/timeout), short-circuit.
2. Zero exit code → parse stdout as JSON; a parse failure is itself a failure.
3. For `tools/list`, validate the response against a zod schema requiring a `tools`
   array with named entries — this is a minimal MCP-shape check, distinct from and
   layered underneath the plan §8 static-check policy rules (kakao substring, tool
   count, annotation completeness, etc.) which task #7 implements separately.
4. For any `tools/call` the caller requests, explicitly read `isError` from the parsed
   body and fail if `true`, regardless of exit code.

### Operational note: pin the CLI as a real dependency, not a bare `npx` call

`@modelcontextprotocol/inspector@0.22.0` is declared as an exact-pinned `dependency` (not
`devDependency`) of `packages/validator`, because the `validating` pipeline stage
(task #9, `apps/worker`) invokes it at runtime, not just in tests. With the package
present in the workspace's `node_modules`, `npx --yes @modelcontextprotocol/inspector@0.22.0`
resolves locally (~1.1s wall time, no registry hit, no `EBADENGINE` noise observed in that
path) instead of doing a fresh npm fetch per validation. Recommend the same pattern
(pin instead of relying on ad hoc `npx` resolution) for the runtime container so
production doesn't depend on npm registry availability during the `validating` stage.

### R1 interaction (safety invariant)

The runner never decides on its own which tools to `tools/call` — the caller
(the `validating` stage pipeline) must pass only `readOnly`-annotated, probe-safe tools
per plan invariant R1. This mirrors the same rule applied to the latency probe.

## 5. Artifacts

- `scripts/spike/server.mjs` — throwaway minimal MCP server used only for this spike.
- `scripts/spike/package.json` — isolated npm project (deliberately outside the pnpm
  workspace globs `apps/*`/`packages/*`; `node_modules/` is gitignored at the repo root).
- `packages/validator/src/inspector-runner.ts` — the adopted runner:
  `inspectServer(url, { toolCalls?, inspectorPackage?, timeoutMs?, exec? }) => Promise<{ passed, failures }>`.
- `packages/validator/src/inspector-runner.test.ts`,
  `packages/validator/src/default-cli-executor.test.ts` — unit tests (14 tests, 100%
  statement/line/function coverage, 89% branch coverage on `inspector-runner.ts`) using
  an injectable `CliExecutor` so no test spawns a real process or touches the network.

## 6. Follow-ups for later tasks

- Task #7 (`packages/validator` static-check gate): compose `inspectServer` with the
  static rule set; `inspectServer`'s zod check is intentionally generic MCP-shape only.
- Task #9 (`apps/worker`): call `inspectServer` during `validating`, passing only
  readOnly-annotated tools with synthesized-safe args derived from the declarative spec.
- If Inspector is ever bumped past `0.22.0`, re-run scenarios 3.1–3.4 and update this
  document before changing the pin.
