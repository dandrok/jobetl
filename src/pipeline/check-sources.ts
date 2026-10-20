import { JOB_SOURCES, type JobSource, type SourceConfigMap } from "@core/types";
import type { SourceAdapterMap } from "@scrapers/types";
import { fetchText } from "@pipeline/run";

export type SourceCheckStatus = "ok" | "degraded" | "error" | "skipped";

export interface SourceCheckResult {
  source: JobSource;
  status: SourceCheckStatus;
  listings: number;
  latencyMs: number;
  validationFailures: number;
  error?: string;
}

export async function checkSource(
  source: JobSource,
  adapters: SourceAdapterMap,
  sources: SourceConfigMap,
  capturedWarnings?: string[]
): Promise<SourceCheckResult> {
  const config = sources[source];

  if (!config.enabled) {
    return { source, status: "skipped", listings: 0, latencyMs: 0, validationFailures: 0 };
  }

  const warnings: string[] = capturedWarnings ?? [];
  const originalWarn = console.warn;
  if (!capturedWarnings) {
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
  }

  const start = performance.now();
  try {
    const listings = await adapters[source].discoverListings(config, fetchText);
    const latencyMs = Math.round(performance.now() - start);
    const failurePattern = `[VALIDATION_FAILURE][${source}]`;
    const validationFailures = warnings.filter((w) => w.includes(failurePattern)).length;
    const status: SourceCheckStatus = listings.length === 0 ? "degraded" : "ok";

    return { source, status, listings: listings.length, latencyMs, validationFailures };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const failurePattern = `[VALIDATION_FAILURE][${source}]`;
    const validationFailures = warnings.filter((w) => w.includes(failurePattern)).length;
    return {
      source,
      status: "error",
      listings: 0,
      latencyMs,
      validationFailures,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    if (!capturedWarnings) {
      console.warn = originalWarn;
    }
  }
}

export async function checkAllSources(
  adapters: SourceAdapterMap,
  sources: SourceConfigMap
): Promise<SourceCheckResult[]> {
  const allWarnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    allWarnings.push(args.map(String).join(" "));
  };

  try {
    const results = await Promise.all(
      JOB_SOURCES.map((source) => checkSource(source, adapters, sources, allWarnings))
    );
    // Re-evaluate validationFailures and status now that all promises have settled and all warnings collected
    return results.map((res) => {
      if (res.status === "skipped") {
        return res;
      }
      const failurePattern = `[VALIDATION_FAILURE][${res.source}]`;
      const validationFailures = allWarnings.filter((w) => w.includes(failurePattern)).length;
      const status: SourceCheckStatus =
        res.status === "ok" && res.listings === 0 ? "degraded" : res.status;

      return {
        ...res,
        status,
        validationFailures
      };
    });
  } finally {
    console.warn = originalWarn;
  }
}
