import { describe, expect, test } from "vitest";

import { buildNotionJobPage } from "../src/notion/build-job-page.js";
import type { MatchCandidate } from "../src/types.js";

describe("buildNotionJobPage", () => {
  test("maps a matched job into notion properties", () => {
    const candidate: MatchCandidate = {
      job: {
        externalId: "justjoinit:/job-offer/acme",
        source: "justjoinit",
        url: "https://justjoin.it/job-offer/acme",
        title: "Senior Node Engineer",
        company: "Acme",
        salaryText: "20 000 - 28 000 PLN/month",
        location: "Remote",
        offerMarkdown: "# Offer"
      },
      match: {
        score: 0.91,
        reason: "Strong overlap in Node.js, TypeScript, and ETL.",
        summary: "Backend platform role with Node.js and data tooling.",
        shouldSave: true
      }
    };

    const page = buildNotionJobPage("database-id", candidate, new Date("2026-04-10T10:00:00.000Z"));

    expect(page.parent).toEqual({ database_id: "database-id" });
    expect(page.properties["Job Title"]).toMatchObject({
      title: [{ text: { content: "Senior Node Engineer" } }]
    });
    expect(page.properties["Match Score"]).toMatchObject({
      number: 0.91
    });
    expect(page.properties["External ID"]).toMatchObject({
      rich_text: [{ text: { content: "justjoinit:/job-offer/acme" } }]
    });
  });
});
