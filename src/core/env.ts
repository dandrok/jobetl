import "dotenv/config";

import type { NotionSyncEnv, RuntimeEnv, ServerEnv } from "@core/types";

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

export function loadServerEnv(): ServerEnv {
  const isProduction = process.env.NODE_ENV === "production";
  const port = Number(process.env.PORT ?? 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  return {
    // Validated at boot so a misconfigured server refuses to start rather than
    // booting healthy and rejecting every login attempt at runtime.
    passwordHash: requireEnv("DASHBOARD_PASSWORD_HASH"),
    port,
    // Behind nginx there is no reason to accept connections from anywhere else.
    host: process.env.HOST ?? (isProduction ? "127.0.0.1" : "0.0.0.0"),
    isProduction,
    trustProxy: process.env.TRUST_PROXY === "true",
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN ?? "http://localhost:3000"
  };
}
