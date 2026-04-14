import type { StoredJob } from "../types.js";
import type { NotionJobDatabaseSchema } from "./schema.js";

type NotionText = {
  type: "text";
  text: {
    content: string;
  };
};

export type NotionPageProperties = Record<string, unknown>;

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
