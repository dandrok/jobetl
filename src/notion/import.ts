import type { StoredJob } from "../types.js";
import type { NotionPageBatch } from "./client.js";
import { mapNotionPageToStoredJob } from "./mapper.js";
import type { NotionJobDatabaseSchema } from "./schema.js";

export interface StoredJobWriter {
  upsertStoredJob(job: StoredJob): void;
}

export interface NotionImportClient {
  getSchema(): Promise<NotionJobDatabaseSchema>;
  listJobsPage(startCursor?: string): Promise<NotionPageBatch>;
}

export interface NotionImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function importJobsFromNotion(
  repository: StoredJobWriter,
  client: NotionImportClient
): Promise<NotionImportSummary> {
  const schema = await client.getSchema();
  const summary: NotionImportSummary = {
    total: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  let cursor: string | undefined;

  do {
    const batch = await client.listJobsPage(cursor);

    for (const page of batch.results) {
      summary.total += 1;

      let job: StoredJob;
      try {
        job = mapNotionPageToStoredJob(page, schema);
      } catch {
        summary.skipped += 1;
        continue;
      }

      try {
        repository.upsertStoredJob(job);
        summary.imported += 1;
      } catch (error: unknown) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(`${page.id}: ${message}`);
      }
    }

    cursor = batch.nextCursor;
  } while (cursor);

  return summary;
}
