import "dotenv/config";

import type { NotionSyncEnv, RuntimeEnv } from "@core/types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadRuntimeEnv(): RuntimeEnv {
  return {
    jinaApiKey: process.env.JINA_API_KEY || "",
    deepseekApiKey: requireEnv("DEEPSEEK_API_KEY"),
    resendApiKey: process.env.RESEND_API_KEY,
    senderEmail: process.env.SENDER_EMAIL,
    recipientEmail: process.env.RECIPIENT_EMAIL
  };
}

export function loadNotionSyncEnv(): NotionSyncEnv {
  return {
    notionToken: requireEnv("NOTION_TOKEN"),
    notionDatabaseId: requireEnv("NOTION_DATABASE_ID")
  };
}
