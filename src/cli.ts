import { parseCliOptions } from "./cli-options.js";
import { config } from "./config.js";
import { OraProgressReporter } from "./progress/ora-progress-reporter.js";
import { runPipeline } from "./pipeline/run.js";

const progress = new OraProgressReporter();

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const summary = await runPipeline(config, progress, undefined, options);
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
