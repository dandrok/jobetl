import { config } from "./config.js";
import { runPipeline } from "./pipeline/run.js";

async function main(): Promise<void> {
  const summary = await runPipeline(config);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
