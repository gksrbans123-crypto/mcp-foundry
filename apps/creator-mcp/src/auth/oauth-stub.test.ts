import { describe, expect, it } from "vitest";
import { createOAuthStubAuthN } from "./oauth-stub.js";

describe("createOAuthStubAuthN", () => {
  it("rejects issueToken as not implemented", async () => {
    const authn = createOAuthStubAuthN();
    await expect(authn.issueToken()).rejects.toThrow(/not implemented/);
  });

  it("rejects verify as not implemented", async () => {
    const authn = createOAuthStubAuthN();
    await expect(authn.verify("anything")).rejects.toThrow(/not implemented/);
  });
});
