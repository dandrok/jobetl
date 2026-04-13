import { config } from "./config.js";
import { OraProgressReporter } from "./progress/ora-progress-reporter.js";
import { runPipeline } from "./pipeline/run.js";

const progress = new OraProgressReporter();

async function main(): Promise<void> {
  const summary = await runPipeline(config, progress);
  progress.succeed(
    `Done: scanned=${summary.scanned} skipped=${summary.skipped} fetched=${summary.fetched} matched=${summary.matched} rejected=${summary.rejected} failed=${summary.failed} local-db-total=${summary.stored}`
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  progress.fail(message);
  process.exitCode = 1;
});
