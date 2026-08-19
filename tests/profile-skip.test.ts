import { describe, expect, test } from "vitest";

import { shouldSkipJobForProfile } from "@pipeline/profile-skip";

describe("shouldSkipJobForProfile", () => {
  test("does not skip non-terminal statuses", () => {
    expect(shouldSkipJobForProfile("discovered", "software", "ai")).toBe(false);
    expect(shouldSkipJobForProfile("error", null, "software")).toBe(false);
    expect(shouldSkipJobForProfile(undefined, undefined, "software")).toBe(false);
  });

  test("skips when the same profile already scored", () => {
    expect(shouldSkipJobForProfile("matched", "software", "software")).toBe(true);
    expect(shouldSkipJobForProfile("rejected", "ai", "ai")).toBe(true);
  });

  test("does not skip when another profile scored", () => {
    expect(shouldSkipJobForProfile("matched", "software", "ai")).toBe(false);
    expect(shouldSkipJobForProfile("rejected", "ai", "software")).toBe(false);
  });

  test("skips when profile is both", () => {
    expect(shouldSkipJobForProfile("matched", "both", "software")).toBe(true);
    expect(shouldSkipJobForProfile("matched", "both", "ai")).toBe(true);
  });

  test("treats legacy null profile as software-era", () => {
    expect(shouldSkipJobForProfile("matched", null, "software")).toBe(true);
    expect(shouldSkipJobForProfile("matched", null, "ai")).toBe(false);
    expect(shouldSkipJobForProfile("rejected", undefined, "ai")).toBe(false);
  });
});
