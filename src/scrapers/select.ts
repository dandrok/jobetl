import {
  JOB_SOURCES,
  type JobSource,
  type ProfileRunConfig,
  type SourceConfigMap
} from "@core/types";
import type { SelectedSource, SourceAdapterMap } from "@scrapers/types";

function resolveSourceMap(config: SourceConfigMap | ProfileRunConfig): SourceConfigMap {
  if ("profileId" in config) {
    return config.sources;
  }

  return config;
}

export function selectSources(
  config: SourceConfigMap | ProfileRunConfig,
  adapters: SourceAdapterMap,
  source?: JobSource
): SelectedSource[] {
  const sourceMap = resolveSourceMap(config);
  const sources = source ? [source] : JOB_SOURCES;

  return sources.flatMap((sourceName) => {
    const sourceConfig = sourceMap[sourceName];

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
