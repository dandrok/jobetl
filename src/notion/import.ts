import type { StoredJob } from "@core/types";
import type { NotionPageBatch } from "@notion/client";
import { mapNotionPageToStoredJob } from "@notion/mapper";
import type { NotionJobDatabaseSchema } from "@notion/schema";

export interface StoredJobWriter {
  upsertStoredJob(job: StoredJob): Promise<void>;
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
        await repository.upsertStoredJob(job);
        summary.imported += 1;
      } catch (error: unknown) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(`${page.id}: ${message}`);

        // Gated debug logging (set DEBUG_DB=1 to enable)
        if (process.env.DEBUG_DB && error instanceof Error) {
          const err = error as Error & { code?: string; detail?: string; hint?: string };
          console.error(`DB error for ${page.id}:`, {
            message: err.message,
            code: err.code,
            detail: err.detail ? String(err.detail).slice(0, 300) : undefined,
            hint: err.hint ? String(err.hint).slice(0, 200) : undefined
            // query not logged (security)
          });
        }
      }
    }

    cursor = batch.nextCursor;
  } while (cursor);

  return summary;
}
