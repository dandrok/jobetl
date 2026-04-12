import { readFile } from "node:fs/promises";

import { loadRuntimeEnv } from "../env.js";
import { JinaReaderClient } from "../jina/client.js";
import { DeepSeekMatcher } from "../matching/deepseek-matcher.js";
import { selectMatches } from "./select-matches.js";
import { JustJoinItAdapter } from "../sources/justjoinit.js";
import { SQLiteJobRepository } from "../storage/sqlite-job-repository.js";
import type { JobOffer, MatchCandidate, RunConfig } from "../types.js";

export interface RunSummary {
  scanned: number;
  fetched: number;
  matched: number;
  stored: number;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }

  return response.text();
}

export async function runPipeline(config: RunConfig): Promise<RunSummary> {
  const env = loadRuntimeEnv();
  const adapter = new JustJoinItAdapter();
  const listingUrl = adapter.buildSearchUrl(config.sources.justjoinit.filters);
  const listingHtml = await fetchText(listingUrl);
  const listings = adapter
    .parseListings(listingHtml)
    .slice(0, config.sources.justjoinit.maxListings);
  const resumeMarkdown = await readFile(config.resumeMarkdownPath, "utf8");
  const jina = new JinaReaderClient(env.jinaApiKey);
  const matcher = new DeepSeekMatcher(env.deepseekApiKey);
  const repository = new SQLiteJobRepository(config.databasePath);
  const candidates: MatchCandidate[] = [];
  let fetched = 0;

  for (const listing of listings) {
    repository.upsertDiscoveredJob(listing);
    const offerMarkdown = await jina.fetchMarkdown(listing.url);
    repository.saveFetchedOffer(listing.externalId, offerMarkdown);
    fetched += 1;
    const offer: JobOffer = { ...listing, offerMarkdown };
    const match = await matcher.scoreOffer(offer, resumeMarkdown);
    const candidate = {
      job: offer,
      match: {
        ...match,
        shouldSave: match.score >= config.matchThreshold
      }
    };
    repository.saveScoredJob(candidate);
    candidates.push(candidate);
  }

  const selected = selectMatches(candidates, config.matchThreshold);

  return {
    scanned: listings.length,
    fetched,
    matched: selected.length,
    stored: repository.listJobs().length
  };
}
