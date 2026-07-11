import { describe, expect, it } from "vitest";
import { hashOwnerToken, maskOwnerToken } from "./token";

describe("hashOwnerToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashOwnerToken("abc123")).toBe(hashOwnerToken("abc123"));
  });

  it("differs for different inputs", () => {
    expect(hashOwnerToken("abc123")).not.toBe(hashOwnerToken("abc124"));
  });

  it("never returns the raw token itself", () => {
    expect(hashOwnerToken("abc123")).not.toContain("abc123");
  });
});

describe("maskOwnerToken", () => {
  it("keeps only the first and last 4 characters of a long token", () => {
    expect(maskOwnerToken("abcd1234567890wxyz")).toBe("abcd••••••••wxyz");
  });

  it("fully masks tokens too short to safely reveal a prefix/suffix", () => {
    expect(maskOwnerToken("short")).toBe("•••••");
  });

  it("never includes the raw token as a substring of the output", () => {
    const raw = "supersecretownertoken";
    expect(maskOwnerToken(raw)).not.toContain(raw);
  });
});
