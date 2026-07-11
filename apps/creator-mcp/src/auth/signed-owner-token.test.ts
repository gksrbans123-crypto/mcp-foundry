import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepos } from "../repos/memory-repos.js";
import { createSignedOwnerTokenAuthN } from "./signed-owner-token.js";

const SECRET = "test-owner-token-secret";

describe("createSignedOwnerTokenAuthN", () => {
  it("issues a token that verifies back to the same userId", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    const issued = await authn.issueToken();
    const verifiedUserId = await authn.verify(issued.token);

    expect(verifiedUserId).toBe(issued.userId);
  });

  it("matches apps/dashboard's independent authRef derivation: sha256(rawToken)", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    const issued = await authn.issueToken();
    const user = await repos.users.findOrCreateByAuthRef(createHash("sha256").update(issued.token).digest("hex"));

    expect(user.id).toBe(issued.userId);
  });

  it("rejects a token signed with a different secret", async () => {
    const repos = createMemoryRepos();
    const issuer = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });
    const verifier = createSignedOwnerTokenAuthN({ secret: "wrong-secret", users: repos.users });

    const issued = await issuer.issueToken();
    expect(await verifier.verify(issued.token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });
    const issued = await authn.issueToken();

    const [, signature] = issued.token.split(".");
    const tampered = `tampered-payload.${signature}`;

    expect(await authn.verify(tampered)).toBeNull();
  });

  it("rejects a malformed token (no separator)", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    expect(await authn.verify("not-a-real-token")).toBeNull();
  });

  it("rejects undefined/empty tokens without throwing", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    expect(await authn.verify(undefined)).toBeNull();
    expect(await authn.verify("")).toBeNull();
  });

  it("issues distinct tokens/users across calls", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    const first = await authn.issueToken();
    const second = await authn.issueToken();

    expect(first.token).not.toBe(second.token);
    expect(first.userId).not.toBe(second.userId);
  });
});
