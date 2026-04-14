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
});
