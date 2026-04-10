import { readFile } from "node:fs/promises";

import { loadRuntimeEnv } from "../env.js";
import { JinaReaderClient } from "../jina/client.js";
import { DeepSeekMatcher } from "../matching/deepseek-matcher.js";
import { NotionJobRepository } from "../notion/client.js";
import { selectMatches } from "./select-matches.js";
import { JustJoinItAdapter } from "../sources/justjoinit.js";
import type { JobOffer, MatchCandidate, RunConfig } from "../types.js";

export interface RunSummary {
  scanned: number;
  matched: number;
  saved: number;
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
  const notion = new NotionJobRepository(env.notionApiKey);
  const candidates: MatchCandidate[] = [];

  for (const listing of listings) {
    const offerMarkdown = await jina.fetchMarkdown(listing.url);
    const offer: JobOffer = { ...listing, offerMarkdown };
    const match = await matcher.scoreOffer(offer, resumeMarkdown);
    candidates.push({
      job: offer,
      match: {
        ...match,
        shouldSave: match.score >= config.matchThreshold
      }
    });
  }

  const selected = selectMatches(candidates, config.matchThreshold);
  let saved = 0;

  for (const candidate of selected) {
    const exists = await notion.hasExternalId(
      config.notionDatabaseId,
      candidate.job.externalId
    );

    if (exists) {
      continue;
    }

    if (config.dryRun) {
      saved += 1;
      continue;
    }

    await notion.createJob(config.notionDatabaseId, candidate);
    saved += 1;
  }

  return {
    scanned: listings.length,
    matched: selected.length,
    saved
  };
}
