import { describe, expect, test } from "vitest";

import { selectMatches } from "../src/pipeline/select-matches.js";
import type { MatchCandidate } from "../src/types.js";

describe("selectMatches", () => {
  test("returns only jobs above threshold", () => {
    const candidates: MatchCandidate[] = [
      {
        job: {
          externalId: "1",
          source: "justjoinit",
          url: "https://example.com/1",
          title: "Senior Node Engineer",
          company: "Acme",
          location: "Remote",
          offerMarkdown: "# Offer"
        },
        match: {
          score: 0.91,
          reason: "Strong overlap in Node.js, ETL, and backend ownership.",
          summary: "Backend role focused on Node.js and data pipelines.",
          shouldSave: true
        }
      },
      {
        job: {
          externalId: "2",
          source: "justjoinit",
          url: "https://example.com/2",
          title: "Frontend Engineer",
          company: "Beta",
          location: "Remote",
          offerMarkdown: "# Offer"
        },
        match: {
          score: 0.42,
          reason: "Mostly frontend work with limited backend overlap.",
          summary: "Frontend-heavy role.",
          shouldSave: false
        }
      }
    ];

    const selected = selectMatches(candidates, 0.75);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.job.externalId).toBe("1");
  });
});
