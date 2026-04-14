import { config } from "./config.js";
import { loadNotionSyncEnv } from "./env.js";
import { NotionDatabaseClient } from "./notion/client.js";
import { OraNotionSyncProgressReporter } from "./notion/ora-progress-reporter.js";
import { syncJobsToNotion } from "./notion/sync.js";
import { SQLiteJobRepository } from "./storage/sqlite-job-repository.js";

const progress = new OraNotionSyncProgressReporter();

async function main(): Promise<void> {
  const repository = new SQLiteJobRepository(config.databasePath);
  const client = new NotionDatabaseClient(loadNotionSyncEnv());
  const summary = await syncJobsToNotion(repository, client, progress);

  progress.succeed(
    `Notion sync complete | processed ${summary.total} | created ${summary.created} | updated ${summary.updated} | skipped ${summary.skipped} | failed ${summary.failed}`
  );

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  progress.fail(message);
  console.error(message);
  process.exitCode = 1;
});
