import { parseCliOptions } from "@core/cli-options";
import { config } from "@core/config";
import { OraProgressReporter } from "@progress/ora-progress-reporter";
import { runPipeline } from "@pipeline/run";
import { loadNotionSyncEnv } from "@core/env";
import { NotionDatabaseClient } from "@notion/client";
import { OraNotionSyncProgressReporter } from "@notion/ora-progress-reporter";
import { syncJobsToNotion } from "@notion/sync";
import { importJobsFromNotion } from "@notion/import";
import { SQLiteJobRepository } from "@storage/sqlite-job-repository";
import { startServer } from "./server";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isOptionFlag = args[0] && args[0].startsWith("-");
  const command = isOptionFlag ? "scrape" : args[0] || "scrape";
  const scrapeArgs = isOptionFlag ? args : args.slice(1);

  if (command === "scrape") {
    const progress = new OraProgressReporter();
    try {
      const options = parseCliOptions(scrapeArgs);
      const summary = await runPipeline(config, progress, undefined, options);
      progress.succeed(
        `Done: scanned=${summary.scanned} skipped=${summary.skipped} fetched=${summary.fetched} matched=${summary.matched} rejected=${summary.rejected} failed=${summary.failed} local-db-total=${summary.stored}`
      );
      console.log(JSON.stringify(summary, null, 2));
    } catch (e: unknown) {
      progress.fail(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  } else if (command === "sync-notion") {
    const progress = new OraNotionSyncProgressReporter();
    try {
      const repository = new SQLiteJobRepository(config.databasePath);
      const client = new NotionDatabaseClient(loadNotionSyncEnv());
      const summary = await syncJobsToNotion(repository, client, progress);
      progress.succeed(
        `Notion sync complete | processed ${summary.total} | created ${summary.created} | updated ${summary.updated} | skipped ${summary.skipped} | failed ${summary.failed}`
      );
      console.log(JSON.stringify(summary, null, 2));
      if (summary.failed > 0) process.exitCode = 1;
    } catch (e: unknown) {
      progress.fail(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  } else if (command === "import-notion") {
    try {
      const repository = new SQLiteJobRepository(config.databasePath);
      const client = new NotionDatabaseClient(loadNotionSyncEnv());
      const summary = await importJobsFromNotion(repository, client);
      console.log(JSON.stringify(summary, null, 2));
      if (summary.failed > 0) process.exitCode = 1;
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  } else if (command === "report") {
    const repository = new SQLiteJobRepository(config.databasePath);
    const jobs = repository.listMatchedJobs(10);
    if (jobs.length === 0) {
      console.log("No matched jobs stored yet.");
      return;
    }
    for (const job of jobs) {
      console.log(
        [
          `${job.matchScore?.toFixed(2) ?? "0.00"} | ${job.title} | ${job.company}`,
          `status=${job.status}`,
          job.salaryText ? `salary=${job.salaryText}` : undefined,
          job.url
        ]
          .filter(Boolean)
          .join(" | ")
      );
    }
  } else if (command === "serve") {
    startServer();
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(`Available commands: scrape, sync-notion, import-notion, report, serve`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
