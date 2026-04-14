import { afterEach, describe, expect, test } from "vitest";

import { loadNotionSyncEnv } from "../src/env.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadNotionSyncEnv", () => {
  test("throws when NOTION_TOKEN is missing", () => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_DATABASE_ID;

    expect(() => loadNotionSyncEnv()).toThrow(
      "Missing required environment variable: NOTION_TOKEN"
    );
  });

  test("throws when NOTION_DATABASE_ID is missing", () => {
    process.env.NOTION_TOKEN = "secret_test";
    delete process.env.NOTION_DATABASE_ID;

    expect(() => loadNotionSyncEnv()).toThrow(
      "Missing required environment variable: NOTION_DATABASE_ID"
    );
  });

  test("returns notion sync credentials when both values are present", () => {
    process.env.NOTION_TOKEN = "secret_test";
    process.env.NOTION_DATABASE_ID = "database-id";

    expect(loadNotionSyncEnv()).toEqual({
      notionToken: "secret_test",
      notionDatabaseId: "database-id"
    });
  });
});
