import { JOB_SOURCES, type JobSource } from "./types.js";

export interface CliOptions {
  source?: JobSource;
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--source") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --source");
      }

      if (!JOB_SOURCES.includes(value as JobSource)) {
        throw new Error(
          `Unsupported source "${value}". Expected one of: ${JOB_SOURCES.join(", ")}`
        );
      }

      options.source = value as JobSource;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}
