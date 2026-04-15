import { afterEach, describe, expect, test, vi } from "vitest";

import { NotionDatabaseClient } from "../src/notion/client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("NotionDatabaseClient", () => {
  test("loads and normalizes the database schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        properties: {
          Name: { type: "title" },
          "External ID": { type: "rich_text" },
          URL: { type: "url" },
          Status: { type: "status" },
          "Updated At": { type: "rich_text" }
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new NotionDatabaseClient({
      notionToken: "secret_test",
      notionDatabaseId: "database-id"
    });

    await expect(client.getSchema()).resolves.toEqual({
      statusKind: "status",
      updatedAtKind: "rich_text"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/databases/database-id",
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  test("finds an existing page and reads the synced updated timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: "page-1",
            properties: {
              "Updated At": {
                type: "rich_text",
                rich_text: [{ plain_text: "2024-01-02T00:00:00.000Z" }]
              }
            }
          }
        ]
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new NotionDatabaseClient({
      notionToken: "secret_test",
      notionDatabaseId: "database-id"
    });

    await expect(
      client.findExistingJob("justjoinit:/job-offer/acme")
    ).resolves.toEqual({
      pageId: "page-1",
      syncedUpdatedAt: "2024-01-02T00:00:00.000Z"
    });
  });

  test("lists database pages with pagination metadata for hydration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: "page-1",
            created_time: "2024-01-01T00:00:00.000Z",
            last_edited_time: "2024-01-03T00:00:00.000Z",
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
        has_more: true,
        next_cursor: "cursor-2"
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new NotionDatabaseClient({
      notionToken: "secret_test",
      notionDatabaseId: "database-id"
    });

    await expect(client.listJobsPage()).resolves.toEqual({
      results: [
        {
          id: "page-1",
          createdTime: "2024-01-01T00:00:00.000Z",
          lastEditedTime: "2024-01-03T00:00:00.000Z",
          properties: expect.any(Object)
        }
      ],
      nextCursor: "cursor-2"
    });
  });

  test("retries transient 504 responses before succeeding", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>timeout</html>", {
          status: 504,
          statusText: "Gateway Timeout",
          headers: {
            "content-type": "text/html"
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          properties: {
            Name: { type: "title" },
            "External ID": { type: "rich_text" },
            URL: { type: "url" },
            Status: { type: "status" }
          }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = new NotionDatabaseClient({
      notionToken: "secret_test",
      notionDatabaseId: "database-id"
    });

    const schemaPromise = client.getSchema();
    await vi.runAllTimersAsync();

    await expect(schemaPromise).resolves.toEqual({
      statusKind: "status"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
