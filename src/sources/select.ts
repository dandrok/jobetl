import { JOB_SOURCES, type JobSource, type RunConfig } from "../types.js";
import type { SelectedSource, SourceAdapterMap } from "./types.js";

export function selectSources(
  config: RunConfig,
  adapters: SourceAdapterMap,
  source?: JobSource
): SelectedSource[] {
  const sources = source ? [source] : JOB_SOURCES;

  return sources.flatMap((sourceName) => {
    const sourceConfig = config.sources[sourceName];

    if (!sourceConfig.enabled) {
      if (source) {
        throw new Error(`Source "${source}" is disabled in config`);
      }

      return [];
    }

    return [
      {
        source: sourceName,
        adapter: adapters[sourceName],
        config: sourceConfig
      }
    ];
  });
}
