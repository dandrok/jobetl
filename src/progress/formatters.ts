import type { PipelineProgressSnapshot, PipelineStage } from "../types.js";

export function formatRunStartText(totalListings: number): string {
  return `Found ${totalListings} listings to process`;
}

export function derivePipelineStage(
  snapshot: PipelineProgressSnapshot
): PipelineStage {
  if (snapshot.stage === "done") {
    return "done";
  }

  const hasFetchWork = snapshot.fetching > 0 || snapshot.queuedFetch > 0;
  const hasScoreWork = snapshot.scoring > 0 || snapshot.queuedScore > 0;

  if (hasFetchWork && hasScoreWork) {
    return "mixed";
  }

  if (hasFetchWork) {
    return "fetching";
  }

  if (hasScoreWork) {
    return "scoring";
  }

  if (snapshot.stage === "discovering") {
    return "discovering";
  }

  return snapshot.stage;
}

export function formatPipelineProgressText(
  snapshot: PipelineProgressSnapshot
): string {
  const stage = derivePipelineStage(snapshot);
  const parts = [
    `stage: ${stage}`,
    `discovered ${snapshot.discovered}`,
    `skipped ${snapshot.skipped}`,
    `queued-fetch ${snapshot.queuedFetch}`,
    `fetching ${snapshot.fetching}`,
    `queued-score ${snapshot.queuedScore}`,
    `scoring ${snapshot.scoring}`,
    `matched ${snapshot.matched}`,
    `rejected ${snapshot.rejected}`,
    `failed ${snapshot.failed}`
  ];

  const activeParts: string[] = [];

  if (snapshot.activeFetchCompanies.length > 0) {
    activeParts.push(`fetching ${snapshot.activeFetchCompanies[0]}`);
  }

  if (snapshot.activeScoreCompanies.length > 0) {
    activeParts.push(`scoring ${snapshot.activeScoreCompanies[0]}`);
  }

  if (activeParts.length > 0) {
    parts.push(`current: ${activeParts.join(", ")}`);
  }

  return parts.join(" | ");
}
