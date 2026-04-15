import { describe, expect, test, vi } from "vitest";

import { importJobsFromNotion } from "../src/notion/import.js";

describe("importJobsFromNotion", () => {
  test("hydrates paginated pages into SQLite-style rows and skips malformed pages", async () => {
    const upsertStoredJob = vi.fn();

    const summary = await importJobsFromNotion(
      { upsertStoredJob },
      {
        getSchema: async () => ({
          statusKind: "status",
          salaryKind: "rich_text"
        }),
        listJobsPage: vi
          .fn()
          .mockResolvedValueOnce({
            results: [
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
                  }
                }
              }
            ],
            nextCursor: "cursor-2"
          })
          .mockResolvedValueOnce({
            results: [
              {
                id: "page-2",
                createdTime: "2024-01-01T00:00:00.000Z",
                lastEditedTime: "2024-01-03T00:00:00.000Z",
                properties: {
                  Name: {
                    type: "title",
                    title: []
                  }
                }
              }
            ],
            nextCursor: undefined
          })
      }
    );

    expect(upsertStoredJob).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      total: 2,
      imported: 1,
      skipped: 1,
      failed: 0
    });
  });
});
