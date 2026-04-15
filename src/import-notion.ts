import { config } from "./config.js";
import { loadNotionSyncEnv } from "./env.js";
import { NotionDatabaseClient } from "./notion/client.js";
import { importJobsFromNotion } from "./notion/import.js";
import { SQLiteJobRepository } from "./storage/sqlite-job-repository.js";

async function main(): Promise<void> {
  const repository = new SQLiteJobRepository(config.databasePath);
  const client = new NotionDatabaseClient(loadNotionSyncEnv());
  const summary = await importJobsFromNotion(repository, client);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
