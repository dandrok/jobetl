import { describe, expect, test } from "vitest";

import { buildNotionJobProperties, mapNotionPageToStoredJob, normalizeDate } from "@notion/mapper";
import type { StoredJob } from "@core/types";

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

  test("maps a Notion page back into a StoredJob using safe fallbacks", () => {
    expect(
      mapNotionPageToStoredJob(
        {
          id: "page-1",
          createdTime: "2024-01-01T00:00:00.000Z",
          lastEditedTime: "2024-01-03T00:00:00.000Z",
          properties: {
            Name: {
              type: "title",
              title: [{ plain_text: "Senior Node Engineer" }]
            },
            "External ID": {
              type: "rich_text",
              rich_text: [{ plain_text: "justjoinit:/job-offer/acme" }]
            },
            URL: {
              type: "url",
              url: "https://justjoin.it/job-offer/acme"
            },
            Status: {
              type: "status",
              status: { name: "matched" }
            },
            Salary: {
              type: "rich_text",
              rich_text: [{ plain_text: "20 000 - 28 000 PLN/month" }]
            }
          }
        },
        {
          statusKind: "status",
          salaryKind: "rich_text"
        }
      )
    ).toEqual({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "",
      salaryText: "20 000 - 28 000 PLN/month",
      location: undefined,
      offerMarkdown: undefined,
      matchScore: undefined,
      matchReason: undefined,
      summary: undefined,
      status: "matched",
      isApplied: false,
      isNotInterested: false,
      appliedAt: undefined,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-03T00:00:00.000Z"
    });
  });
});

describe("normalizeDate", () => {
  test("returns normalized ISO string for valid primary date", () => {
    expect(normalizeDate("2024-01-01T12:00:00.000Z", undefined)).toBe("2024-01-01T12:00:00.000Z");
  });

  test("falls back to page time when primary is invalid", () => {
    expect(normalizeDate("not-a-date", "2024-01-02T00:00:00.000Z")).toBe(
      "2024-01-02T00:00:00.000Z"
    );
  });

  test("prefers primary when both are valid", () => {
    expect(normalizeDate("2024-05-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z")).toBe(
      "2024-05-01T00:00:00.000Z"
    );
  });

  test("normalizes date-only strings via fallback", () => {
    const result = normalizeDate(undefined, "2024-12-31");
    expect(result).toMatch(/2024-12-31T00:00:00\.000Z/);
  });

  test("throws when both primary and fallback are invalid or missing", () => {
    expect(() => normalizeDate("bad", "also-bad")).toThrow("Invalid date value for job");
    expect(() => normalizeDate(undefined, undefined)).toThrow("Invalid date value for job");
  });

  test("handles ISO strings with offset", () => {
    expect(normalizeDate("2024-01-01T12:00:00+02:00", undefined)).toBe("2024-01-01T10:00:00.000Z");
  });
});
