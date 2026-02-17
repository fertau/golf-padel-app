import { describe, expect, it } from "vitest";
import { normalizeUsername } from "./authShared";

describe("normalizeUsername", () => {
  it("applies case-insensitive normalization", () => {
    expect(normalizeUsername("  FER  ")).toBe("fer");
    expect(normalizeUsername("FeR")).toBe("fer");
  });
});
