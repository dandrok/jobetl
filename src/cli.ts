import { parseCliOptions } from "@core/cli-options";
import { config } from "@core/config";
import { MultilineProgressReporter } from "@progress/multiline-progress-reporter";
import { runPipeline } from "@pipeline/run";
import { loadNotionSyncEnv } from "@core/env";
import { NotionDatabaseClient } from "@notion/client";
import { NotionSyncProgressReporter } from "@notion/progress-reporter";
import { syncJobsToNotion } from "@notion/sync";
import { importJobsFromNotion } from "@notion/import";
import { PostgresJobRepository } from "@storage/postgres-job-repository";
import { startServer } from "./server";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isOptionFlag = args[0] && args[0].startsWith("-");
  const command = isOptionFlag ? "scrape" : args[0] || "scrape";
  const scrapeArgs = isOptionFlag ? args : args.slice(1);

  if (command === "scrape") {
    const progress = new MultilineProgressReporter();
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
    const progress = new NotionSyncProgressReporter();
    let repository: PostgresJobRepository | undefined;
    try {
      repository = new PostgresJobRepository(config.databaseUrl);
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
    } finally {
      if (repository) {
        await repository.close();
      }
    }
  } else if (command === "import-notion") {
    let repository: PostgresJobRepository | undefined;
    try {
      repository = new PostgresJobRepository(config.databaseUrl);
      const client = new NotionDatabaseClient(loadNotionSyncEnv());
      const summary = await importJobsFromNotion(repository, client);
      console.log(JSON.stringify(summary, null, 2));
      if (summary.failed > 0) process.exitCode = 1;
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    } finally {
      if (repository) {
        await repository.close();
      }
    }
  } else if (command === "report") {
    let repository: PostgresJobRepository | undefined;
    try {
      repository = new PostgresJobRepository(config.databaseUrl);
      const jobs = await repository.listMatchedJobs(10);
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
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    } finally {
      if (repository) {
        await repository.close();
      }
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
