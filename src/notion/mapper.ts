import { JOB_SOURCES, type JobSource, type JobStatus, type StoredJob } from "../types.js";
import type { NotionDatabasePage } from "./client.js";
import type { NotionJobDatabaseSchema } from "./schema.js";

type NotionText = {
  type: "text";
  text: {
    content: string;
  };
};

export type NotionPageProperties = Record<string, unknown>;

const JOB_STATUSES: JobStatus[] = [
  "discovered",
  "fetching",
  "fetched",
  "scoring",
  "scored",
  "matched",
  "rejected",
  "error"
];

function textList(value: string | undefined): NotionText[] {
  return value
    ? [
        {
          type: "text",
          text: { content: value }
        }
      ]
    : [];
}

function richTextProperty(value: string | undefined): { rich_text: NotionText[] } {
  return {
    rich_text: textList(value)
  };
}

function readTitlePlainText(property: unknown): string | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const value = (property as { title?: unknown }).title;
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

function readSelectName(property: unknown): string | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const select = (property as { select?: { name?: unknown } }).select;
  return select?.name ? String(select.name) : undefined;
}

function readStatusName(property: unknown): string | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const status = (property as { status?: { name?: unknown } }).status;
  return status?.name ? String(status.name) : undefined;
}

function readUrl(property: unknown): string | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const url = (property as { url?: unknown }).url;
  return url ? String(url) : undefined;
}

function readNumber(property: unknown): number | undefined {
  if (!property || typeof property !== "object") {
    return undefined;
  }

  const value = (property as { number?: unknown }).number;
  return typeof value === "number" ? value : undefined;
}

function dateOrRichTextProperty(
  kind: "date" | "rich_text" | undefined,
  value: string
): { date: { start: string } | null } | { rich_text: NotionText[] } | undefined {
  if (!kind) {
    return undefined;
  }

  if (kind === "date") {
    return {
      date: {
        start: value
      }
    };
  }

  return richTextProperty(value);
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

function inferSource(externalId: string): JobSource | undefined {
  const prefix = externalId.split(":")[0];
  return JOB_SOURCES.includes(prefix as JobSource)
    ? (prefix as JobSource)
    : undefined;
}

function normalizeSource(value: string | undefined): JobSource | undefined {
  return JOB_SOURCES.includes(value as JobSource) ? (value as JobSource) : undefined;
}

function normalizeStatus(value: string | undefined): JobStatus | undefined {
  return JOB_STATUSES.includes(value as JobStatus)
    ? (value as JobStatus)
    : undefined;
}

export function buildNotionJobProperties(
  job: StoredJob,
  schema: NotionJobDatabaseSchema
): NotionPageProperties {
  const properties: NotionPageProperties = {
    Name: {
      title: textList(job.title)
    },
    "External ID": richTextProperty(job.externalId),
    URL: {
      url: job.url
    },
    Status:
      schema.statusKind === "status"
        ? { status: { name: job.status } }
        : { select: { name: job.status } }
  };

  if (schema.sourceKind === "select") {
    properties.Source = { select: { name: job.source } };
  } else if (schema.sourceKind === "rich_text") {
    properties.Source = richTextProperty(job.source);
  }

  if (schema.companyKind) {
    properties.Company = richTextProperty(job.company);
  }

  if (schema.salaryKind) {
    properties.Salary = richTextProperty(job.salaryText);
  }

  if (schema.locationKind) {
    properties.Location = richTextProperty(job.location);
  }

  if (schema.matchScoreKind) {
    properties["Match Score"] = {
      number: job.matchScore ?? null
    };
  }

  if (schema.matchReasonKind) {
    properties["Match Reason"] = richTextProperty(job.matchReason);
  }

  if (schema.summaryKind) {
    properties.Summary = richTextProperty(job.summary);
  }

  const createdAtProperty = dateOrRichTextProperty(schema.createdAtKind, job.createdAt);
  if (createdAtProperty) {
    properties["Created At"] = createdAtProperty;
  }

  const updatedAtProperty = dateOrRichTextProperty(schema.updatedAtKind, job.updatedAt);
  if (updatedAtProperty) {
    properties["Updated At"] = updatedAtProperty;
  }

  return properties;
}

export function mapNotionPageToStoredJob(
  page: NotionDatabasePage,
  schema: NotionJobDatabaseSchema
): StoredJob {
  const externalId = readRichTextPlainText(page.properties["External ID"]);
  const title = readTitlePlainText(page.properties.Name);
  const url = readUrl(page.properties.URL);
  const statusValue =
    schema.statusKind === "status"
      ? readStatusName(page.properties.Status)
      : readSelectName(page.properties.Status);
  const sourceValue =
    schema.sourceKind === "select"
      ? readSelectName(page.properties.Source)
      : schema.sourceKind === "rich_text"
        ? readRichTextPlainText(page.properties.Source)
        : undefined;

  const source = normalizeSource(sourceValue) ?? inferSource(externalId ?? "");
  const status = normalizeStatus(statusValue);

  if (!externalId || !title || !url || !source || !status) {
    throw new Error(`Cannot rebuild job from Notion page ${page.id}`);
  }

  return {
    externalId,
    source,
    url,
    title,
    company: readRichTextPlainText(page.properties.Company) ?? "",
    salaryText: readRichTextPlainText(page.properties.Salary),
    location: readRichTextPlainText(page.properties.Location),
    offerMarkdown: undefined,
    matchScore: readNumber(page.properties["Match Score"]),
    matchReason: readRichTextPlainText(page.properties["Match Reason"]),
    summary: readRichTextPlainText(page.properties.Summary),
    status,
    createdAt:
      readDateStart(page.properties["Created At"]) ??
      readRichTextPlainText(page.properties["Created At"]) ??
      page.createdTime,
    updatedAt:
      readDateStart(page.properties["Updated At"]) ??
      readRichTextPlainText(page.properties["Updated At"]) ??
      page.lastEditedTime
  };
}
