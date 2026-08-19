import { describe, expect, test } from "vitest";

import type { MatchCandidate } from "@core/types";
import { mergeScoredJobState } from "@storage/profile-merge";

function candidate(
  score: number,
  shouldSave: boolean,
  reason = "reason",
  summary = "summary"
): MatchCandidate {
  return {
    job: {
      externalId: "justjoinit:/job-offer/x",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/x",
      title: "Role",
      company: "Co",
      offerMarkdown: "# offer"
    },
    match: { score, reason, summary, shouldSave }
  };
}

describe("mergeScoredJobState", () => {
  test("sets profile on first match", () => {
    expect(mergeScoredJobState(undefined, candidate(0.9, true), "software")).toEqual({
      profile: "software",
      status: "matched",
      matchScore: 0.9,
      matchReason: "reason",
      summary: "summary"
    });
  });

  test("upgrades two distinct matches to both and keeps higher score", () => {
    const first = mergeScoredJobState(undefined, candidate(0.8, true, "sw", "sw-sum"), "software");
    const second = mergeScoredJobState(
      {
        profile: first.profile,
        status: first.status,
        matchScore: first.matchScore,
        matchReason: first.matchReason,
        summary: first.summary
      },
      candidate(0.95, true, "ai", "ai-sum"),
      "ai"
    );

    expect(second.profile).toBe("both");
    expect(second.status).toBe("matched");
    expect(second.matchScore).toBe(0.95);
    expect(second.matchReason).toContain("ai");
    expect(second.matchReason).toContain("software");
    expect(second.summary).toBe("ai-sum");
  });

  test("reject from second profile does not clobber prior match", () => {
    const merged = mergeScoredJobState(
      {
        profile: "software",
        status: "matched",
        matchScore: 0.88,
        matchReason: "sw",
        summary: "sw-sum"
      },
      candidate(0.2, false, "ai-no", "ai-no-sum"),
      "ai"
    );

    expect(merged).toEqual({
      profile: "software",
      status: "matched",
      matchScore: 0.88,
      matchReason: "sw",
      summary: "sw-sum"
    });
  });

  test("reject does not clobber legacy matched jobs with null profile", () => {
    const merged = mergeScoredJobState(
      {
        profile: null,
        status: "matched",
        matchScore: 0.9,
        matchReason: "legacy",
        summary: "legacy-sum"
      },
      candidate(0.1, false, "ai-no", "ai-no-sum"),
      "ai"
    );

    expect(merged).toEqual({
      profile: null,
      status: "matched",
      matchScore: 0.9,
      matchReason: "legacy",
      summary: "legacy-sum"
    });
  });

  test("match replaces prior reject from another profile", () => {
    const merged = mergeScoredJobState(
      {
        profile: "software",
        status: "rejected",
        matchScore: 0.1,
        matchReason: "sw-no",
        summary: "sw-no-sum"
      },
      candidate(0.9, true, "ai-yes", "ai-yes-sum"),
      "ai"
    );

    expect(merged).toEqual({
      profile: "ai",
      status: "matched",
      matchScore: 0.9,
      matchReason: "ai-yes",
      summary: "ai-yes-sum"
    });
  });

  test("re-score same profile overwrites fields", () => {
    const merged = mergeScoredJobState(
      {
        profile: "ai",
        status: "matched",
        matchScore: 0.7,
        matchReason: "old",
        summary: "old-sum"
      },
      candidate(0.85, true, "new", "new-sum"),
      "ai"
    );

    expect(merged).toEqual({
      profile: "ai",
      status: "matched",
      matchScore: 0.85,
      matchReason: "new",
      summary: "new-sum"
    });
  });
});
