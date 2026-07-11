import { vi } from "vitest";
import { createMemoryWorkerRepos } from "../repos/memory-repos.js";
import type { PipelineDeps } from "../stage-machine/types.js";

/**
 * A PipelineDeps where every field throws/rejects if called — tests
 * override only the dependencies their scenario actually exercises, and an
 * unexpected call fails loudly instead of silently returning `undefined`.
 */
export function buildTestDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const unexpectedCall = (name: string) => () => Promise.reject(new Error(`${name} should not be called in this test`));

  return {
    queue: {
      enqueue: unexpectedCall("queue.enqueue"),
      claim: unexpectedCall("queue.claim"),
      complete: unexpectedCall("queue.complete"),
      fail: unexpectedCall("queue.fail"),
    },
    repos: createMemoryWorkerRepos(),
    generate: vi.fn(unexpectedCall("generate")),
    validateSpec: vi.fn(() => {
      throw new Error("validateSpec should not be called in this test");
    }),
    checkCompliance: vi.fn(unexpectedCall("checkCompliance")),
    probe: vi.fn(unexpectedCall("probe")),
    deployer: {
      deploy: vi.fn(unexpectedCall("deployer.deploy")),
      remove: vi.fn(unexpectedCall("deployer.remove")),
    },
    ...overrides,
  };
}
