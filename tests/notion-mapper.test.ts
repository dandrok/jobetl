import { describe, expect, test } from "vitest";

import { buildNotionJobProperties } from "../src/notion/mapper.js";
import type { StoredJob } from "../src/types.js";

const job: StoredJob = {
  externalId: "justjoinit:/job-offer/acme",
  source: "justjoinit",
  url: "https://justjoin.it/job-offer/acme",
  title: "Senior Node Engineer",
  company: "Acme",
  salaryText: "20 000 - 28 000 PLN/month",
  location: "Remote",
  offerMarkdown: "# Offer",
  matchScore: 0.91,
  matchReason: "Strong overlap in Node.js and ETL",
  summary: "Backend role with strong Node.js fit",
  status: "matched",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z"
};

describe("buildNotionJobProperties", () => {
  test("maps all supported properties for a fully populated job", () => {
    expect(
      buildNotionJobProperties(job, {
        statusKind: "status",
        sourceKind: "select",
        companyKind: "rich_text",
        salaryKind: "rich_text",
        locationKind: "rich_text",
        matchScoreKind: "number",
        matchReasonKind: "rich_text",
        summaryKind: "rich_text",
        createdAtKind: "date",
        updatedAtKind: "rich_text"
      })
    ).toMatchObject({
      Name: {
        title: [{ text: { content: "Senior Node Engineer" } }]
      },
      "External ID": {
        rich_text: [{ text: { content: "justjoinit:/job-offer/acme" } }]
      },
      URL: { url: "https://justjoin.it/job-offer/acme" },
      Status: { status: { name: "matched" } },
      Source: { select: { name: "justjoinit" } },
      Company: {
        rich_text: [{ text: { content: "Acme" } }]
      },
      Salary: {
        rich_text: [{ text: { content: "20 000 - 28 000 PLN/month" } }]
      },
      Location: {
        rich_text: [{ text: { content: "Remote" } }]
      },
      "Match Score": { number: 0.91 },
      "Match Reason": {
        rich_text: [{ text: { content: "Strong overlap in Node.js and ETL" } }]
      },
      Summary: {
        rich_text: [{ text: { content: "Backend role with strong Node.js fit" } }]
      },
      "Created At": { date: { start: "2024-01-01T00:00:00.000Z" } },
      "Updated At": {
        rich_text: [{ text: { content: "2024-01-02T00:00:00.000Z" } }]
      }
    });
  });

  test("clears optional values when the schema supports them but the job omits them", () => {
    expect(
      buildNotionJobProperties(
        {
          ...job,
          salaryText: undefined,
          location: undefined,
          matchScore: undefined,
          matchReason: undefined,
          summary: undefined
        },
        {
          statusKind: "select",
          companyKind: "rich_text",
          salaryKind: "rich_text",
          locationKind: "rich_text",
          matchScoreKind: "number",
          matchReasonKind: "rich_text",
          summaryKind: "rich_text",
          createdAtKind: "rich_text",
          updatedAtKind: "date"
        }
      )
    ).toMatchObject({
      Status: { select: { name: "matched" } },
      Salary: { rich_text: [] },
      Location: { rich_text: [] },
      "Match Score": { number: null },
      "Match Reason": { rich_text: [] },
      Summary: { rich_text: [] },
      "Created At": {
        rich_text: [{ text: { content: "2024-01-01T00:00:00.000Z" } }]
      },
      "Updated At": { date: { start: "2024-01-02T00:00:00.000Z" } }
    });
  });
});
