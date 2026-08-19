import { JOB_SOURCES, type JobSource, type ProfileId } from "@core/types";

export interface CliOptions {
  source?: JobSource;
  profile?: ProfileId;
}

export function parseCliOptions(args: string[], knownProfiles?: readonly string[]): CliOptions {
  const options: CliOptions = {};
  const profiles = knownProfiles ?? [];

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

    if (arg === "--profile") {
      const value = args[index + 1];

      if (!value) {
        throw new Error("Missing value for --profile");
      }

      if (profiles.length > 0 && !profiles.includes(value)) {
        throw new Error(`Unknown profile "${value}". Expected one of: ${profiles.join(", ")}`);
      }

      options.profile = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}
