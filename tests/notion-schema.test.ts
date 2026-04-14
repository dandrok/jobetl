import { describe, expect, test } from "vitest";

import { buildNotionJobDatabaseSchema } from "../src/notion/schema.js";

describe("buildNotionJobDatabaseSchema", () => {
  test("accepts required properties and supported optional kinds", () => {
    const schema = buildNotionJobDatabaseSchema({
      properties: {
        Name: { type: "title" },
        "External ID": { type: "rich_text" },
        URL: { type: "url" },
        Status: { type: "status" },
        Source: { type: "select" },
        Company: { type: "rich_text" },
        Salary: { type: "rich_text" },
        Location: { type: "rich_text" },
        "Match Score": { type: "number" },
        "Match Reason": { type: "rich_text" },
        Summary: { type: "rich_text" },
        "Created At": { type: "date" },
        "Updated At": { type: "rich_text" }
      }
    });

    expect(schema).toEqual({
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
    });
  });

  test("throws when a required property is missing", () => {
    expect(() =>
      buildNotionJobDatabaseSchema({
        properties: {
          Name: { type: "title" },
          URL: { type: "url" },
          Status: { type: "status" }
        }
      })
    ).toThrow('Missing required Notion property: "External ID"');
  });

  test("throws when Status uses an unsupported type", () => {
    expect(() =>
      buildNotionJobDatabaseSchema({
        properties: {
          Name: { type: "title" },
          "External ID": { type: "rich_text" },
          URL: { type: "url" },
          Status: { type: "rich_text" }
        }
      })
    ).toThrow('Notion property "Status" must use one of: status, select');
  });
});
