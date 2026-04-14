import type { StoredJob } from "../types.js";
import { buildNotionJobProperties, type NotionPageProperties } from "./mapper.js";
import type { NotionJobDatabaseSchema } from "./schema.js";

export interface StoredJobReader {
  listJobs(): StoredJob[];
}

export interface ExistingNotionJob {
  pageId: string;
  syncedUpdatedAt?: string;
}

export interface NotionSyncClient {
  getSchema(): Promise<NotionJobDatabaseSchema>;
  findExistingJob(externalId: string): Promise<ExistingNotionJob | undefined>;
  createJob(properties: NotionPageProperties): Promise<void>;
  updateJob(pageId: string, properties: NotionPageProperties): Promise<void>;
}

export interface NotionSyncSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface NotionSyncProgressSnapshot {
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface NotionSyncProgressReporter {
  start(snapshot: NotionSyncProgressSnapshot): void;
  update(snapshot: NotionSyncProgressSnapshot): void;
}

export async function syncJobsToNotion(
  repository: StoredJobReader,
  client: NotionSyncClient,
  progress?: NotionSyncProgressReporter
): Promise<NotionSyncSummary> {
  const jobs = repository.listJobs();
  const schema = await client.getSchema();
  const summary: NotionSyncSummary = {
    total: jobs.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };
  const snapshot: NotionSyncProgressSnapshot = {
    total: jobs.length,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  };

  progress?.start({ ...snapshot });

  for (const job of jobs) {
    try {
      const existing = await client.findExistingJob(job.externalId);

      if (existing?.syncedUpdatedAt === job.updatedAt) {
        summary.skipped += 1;
        snapshot.skipped += 1;
        snapshot.processed += 1;
        progress?.update({ ...snapshot });
        continue;
      }

      const properties = buildNotionJobProperties(job, schema);

      if (!existing) {
        await client.createJob(properties);
        summary.created += 1;
        snapshot.created += 1;
        snapshot.processed += 1;
        progress?.update({ ...snapshot });
        continue;
      }

      await client.updateJob(existing.pageId, properties);
      summary.updated += 1;
      snapshot.updated += 1;
      snapshot.processed += 1;
      progress?.update({ ...snapshot });
    } catch (error: unknown) {
      summary.failed += 1;
      snapshot.failed += 1;
      snapshot.processed += 1;
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${job.externalId}: ${message}`);
      progress?.update({ ...snapshot });
    }
  }

  return summary;
}
