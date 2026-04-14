import type { NotionSyncEnv } from "../types.js";
import type { NotionPageProperties } from "./mapper.js";
import {
  buildNotionJobDatabaseSchema,
  type NotionDatabaseShape,
  type NotionJobDatabaseSchema
} from "./schema.js";
import type { ExistingNotionJob, NotionSyncClient } from "./sync.js";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionQueryResponse {
  results: Array<{
    id: string;
    properties: Record<string, unknown>;
  }>;
}

function readRichTextPlainText(property: unknown): string | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const value = (property as { rich_text?: unknown }).rich_text;
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) =>
      item && typeof item === "object" && "plain_text" in item
        ? String(item.plain_text)
        : ""
    )
    .join("");
}

function readDateStart(property: unknown): string | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const date = (property as { date?: unknown }).date;
  if (!date || typeof date !== "object" || !("start" in date)) {
    return undefined;
  }

  return date.start ? String(date.start) : undefined;
}

export class NotionDatabaseClient implements NotionSyncClient {
  private schemaPromise?: Promise<NotionJobDatabaseSchema>;

  constructor(private readonly env: NotionSyncEnv) {}

  async getSchema(): Promise<NotionJobDatabaseSchema> {
    if (!this.schemaPromise) {
      this.schemaPromise = this.request<NotionDatabaseShape>(
        `/databases/${this.env.notionDatabaseId}`,
        { method: "GET" }
      ).then((database) => buildNotionJobDatabaseSchema(database));
    }

    return this.schemaPromise;
  }

  async findExistingJob(externalId: string): Promise<ExistingNotionJob | undefined> {
    const response = await this.request<NotionQueryResponse>(
      `/databases/${this.env.notionDatabaseId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 1,
          filter: {
            property: "External ID",
            rich_text: {
              equals: externalId
            }
          }
        })
      }
    );

    const page = response.results[0];
    if (!page) {
      return undefined;
    }

    const updatedAtProperty = page.properties["Updated At"];
    const syncedUpdatedAt =
      readRichTextPlainText(updatedAtProperty) ?? readDateStart(updatedAtProperty);

    return {
      pageId: page.id,
      syncedUpdatedAt
    };
  }

  async createJob(properties: NotionPageProperties): Promise<void> {
    await this.request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: {
          database_id: this.env.notionDatabaseId
        },
        properties
      })
    });
  }

  async updateJob(pageId: string, properties: NotionPageProperties): Promise<void> {
    await this.request(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties
      })
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Notion request failed (${response.status} ${response.statusText}): ${body}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
