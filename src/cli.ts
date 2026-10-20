import { parseCliOptions } from "@core/cli-options";
import { config } from "@core/config";
import { buildProfileRunConfig, listProfileIds, resolveProfilesToRun } from "@core/profiles";
import { MultilineProgressReporter } from "@progress/multiline-progress-reporter";
import { checkAllSources, type SourceCheckResult } from "@pipeline/check-sources";
import { runPipeline, type RunSummary } from "@pipeline/run";
import { createSourceAdapters } from "@scrapers/index";
import { selectSources } from "@scrapers/select";
import { loadNotionSyncEnv, loadRuntimeEnv } from "@core/env";
import { sendCombinedNewsletter } from "@core/email";
import { NotionDatabaseClient } from "@notion/client";
import { NotionSyncProgressReporter } from "@notion/progress-reporter";
import { syncJobsToNotion } from "@notion/sync";
import { importJobsFromNotion } from "@notion/import";
import { PostgresJobRepository } from "@storage/postgres-job-repository";
import { startServer } from "@server/index";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isOptionFlag = args[0] && args[0].startsWith("-");
  const command = isOptionFlag ? "scrape" : args[0] || "scrape";
  const scrapeArgs = isOptionFlag ? args : args.slice(1);

  if (command === "scrape") {
    const progress = new MultilineProgressReporter();
    try {
      const options = parseCliOptions(scrapeArgs, listProfileIds(config));
      const adapters = createSourceAdapters();
      // Profiles run one after another so merge/skip stay correct when the same job
      // appears in multiple lanes. Inside each profile, fetch/score stay concurrent.
      // Each profile may send its own Resend email (same recipient, different subject).
      const profileIds = resolveProfilesToRun(config, options.profile);
      // Validate --source against every profile up front. Without this, a source
      // enabled for one lane but disabled for another scrapes and emails the first
      // lane, then aborts on the second.
      if (options.source) {
        for (const profileId of profileIds) {
          try {
            selectSources(buildProfileRunConfig(config, profileId), adapters, options.source);
          } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(
              `Source "${options.source}" is unusable for profile "${profileId}": ${reason}`,
              { cause: error }
            );
          }
        }
      }
      const summaries: Array<{ profileId: string } & RunSummary> = [];

      for (const profileId of profileIds) {
        const profileConfig = buildProfileRunConfig(config, profileId);
        const summary = await runPipeline(profileConfig, progress, undefined, options);
        progress.succeed(
          `Done [${profileId}]: scanned=${summary.scanned} skipped=${summary.skipped} fetched=${summary.fetched} matched=${summary.matched} rejected=${summary.rejected} failed=${summary.failed} local-db-total=${summary.stored}`
        );
        summaries.push({ profileId, ...summary });
      }

      const env = loadRuntimeEnv();
      await sendCombinedNewsletter(
        summaries.map((s) => ({ profileId: s.profileId, summary: s })),
        env
      );

      const hasDiscoveryErrors = summaries.some((summary) =>
        summary.sourceReports?.some((report) => report.status === "error")
      );
      if (hasDiscoveryErrors) {
        process.exitCode = 1;
      }

      console.log(JSON.stringify(summaries.length === 1 ? summaries[0] : summaries, null, 2));
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
  } else if (command === "check-sources") {
    try {
      const adapters = createSourceAdapters();
      const profiles = Object.entries(config.profiles).filter(([, p]) => p.enabled);
      const statusIcon = (r: SourceCheckResult): string =>
        ({ ok: "✅", degraded: "⚠️", error: "❌", skipped: "⏭️" })[r.status];

      const allResults: Array<{ profileId: string; results: SourceCheckResult[] }> = [];

      for (const [profileId, profile] of profiles) {
        console.log(`\n── Profile: ${profileId} ──`);
        const results = await checkAllSources(adapters, profile.sources);
        allResults.push({ profileId, results });
        console.log(
          [
            "Source".padEnd(16),
            "Status".padEnd(10),
            "Listings".padEnd(10),
            "Failures".padEnd(10),
            "Latency".padEnd(10),
            "Error"
          ].join("│ ")
        );
        console.log("─".repeat(80));
        for (const r of results) {
          console.log(
            [
              r.source.padEnd(16),
              statusIcon(r).padEnd(10),
              String(r.listings).padEnd(10),
              (r.validationFailures > 0 ? String(r.validationFailures) : "—").padEnd(10),
              r.latencyMs ? `${r.latencyMs}ms`.padEnd(10) : "—".padEnd(10),
              r.error ?? ""
            ].join("│ ")
          );
        }
      }

      const problems = allResults.flatMap(({ profileId, results }) =>
        results
          .filter((r) => r.status === "degraded" || r.status === "error")
          .map((r) => ({ profileId, ...r }))
      );

      if (problems.length > 0) {
        console.log("\n🔴 Problems detected:");
        for (const p of problems) {
          const detail =
            p.status === "degraded"
              ? p.validationFailures > 0
                ? `0 listings, ${p.validationFailures} validation failures — field structure changed`
                : `0 listings — outer container selector likely changed or site returned no offers`
              : `error: ${p.error}`;
          console.log(`   ${p.source} [${p.profileId}]: ${detail}`);
        }
        process.exitCode = 1;
      } else {
        const active = allResults.flatMap(({ results }) =>
          results.filter((r) => r.status === "ok")
        );
        console.log(`\n✅ All sources healthy (${active.length} active, 0 problems)`);
      }
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    }
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(
      `Available commands: scrape, check-sources, sync-notion, import-notion, report, serve`
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
