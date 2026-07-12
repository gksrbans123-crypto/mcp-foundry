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

  it("accepts an arbitrary user-chosen token as a stable namespace identity (custom-header auth)", async () => {
    // A value the user types into PlayMCP's custom X-Owner-Token header must
    // resolve to the SAME identity on every call, so list_my_servers / the
    // dashboard persist across PlayMCP's per-call anonymous connections.
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    const first = await authn.verify("my-namespace-key-2026");
    const second = await authn.verify("my-namespace-key-2026");

    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });

  it("maps different tokens to different identities", async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });

    const a = await authn.verify("owner-token-aaaaaaaa");
    const b = await authn.verify("owner-token-bbbbbbbb");

    expect(a).not.toBe(b);
  });

  it("verifies identity independently of the signing secret (verify only hashes the token)", async () => {
    // The dashboard derives the same identity by hashing the raw token with no
    // secret, so verify must be secret-independent to stay consistent with it.
    const repos = createMemoryRepos();
    const issuer = createSignedOwnerTokenAuthN({ secret: SECRET, users: repos.users });
    const otherVerifier = createSignedOwnerTokenAuthN({ secret: "different-secret", users: repos.users });

    const issued = await issuer.issueToken();
    expect(await otherVerifier.verify(issued.token)).toBe(issued.userId);
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
