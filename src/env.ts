import "dotenv/config";

import type { NotionSyncEnv, RuntimeEnv } from "./types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadRuntimeEnv(): RuntimeEnv {
  return {
    jinaApiKey: requireEnv("JINA_API_KEY"),
    deepseekApiKey: requireEnv("DEEPSEEK_API_KEY")
  };
}

export function loadNotionSyncEnv(): NotionSyncEnv {
  return {
    notionToken: requireEnv("NOTION_TOKEN"),
    notionDatabaseId: requireEnv("NOTION_DATABASE_ID")
  };
}
