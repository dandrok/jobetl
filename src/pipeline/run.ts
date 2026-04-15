import { readFile } from "node:fs/promises";

import { loadRuntimeEnv } from "../env.js";
import { JinaReaderClient } from "../jina/client.js";
import { DeepSeekMatcher } from "../matching/deepseek-matcher.js";
import type { ProgressReporter } from "../progress/ora-progress-reporter.js";
import { createSourceAdapters } from "../sources/index.js";
import { selectSources } from "../sources/select.js";
import type { SelectedSource, SourceAdapterMap } from "../sources/types.js";
import { SQLiteJobRepository } from "../storage/sqlite-job-repository.js";
import { AsyncQueue } from "./async-queue.js";
import type {
  JobListing,
  JobOffer,
  JobSource,
  JobStatus,
  MatchCandidate,
  MatchResult,
  PipelineProgressSnapshot,
  RunConfig
} from "../types.js";

export interface RunSummary {
  scanned: number;
  skipped: number;
  fetched: number;
  matched: number;
  rejected: number;
  failed: number;
  stored: number;
}

export interface PipelineRepository {
  upsertDiscoveredJob(job: JobListing): void;
  getJobStatus(externalId: string): JobStatus | undefined;
  markJobFetching(externalId: string): void;
  saveFetchedOffer(externalId: string, offerMarkdown: string): void;
  markJobScoring(externalId: string): void;
  markJobError(externalId: string): void;
  saveScoredJob(candidate: MatchCandidate): void;
}

export interface PipelineDependencies {
  adapters: SourceAdapterMap;
  fetchListingHtml(url: string): Promise<string>;
  loadResumeMarkdown(path: string): Promise<string>;
  fetchOfferMarkdown(url: string): Promise<string>;
  scoreOffer(job: JobOffer, resumeMarkdown: string): Promise<MatchResult>;
  countStoredJobs(): number;
  repository: PipelineRepository;
}

export interface RunPipelineOptions {
  source?: JobSource;
}

function createProgressSnapshot(): PipelineProgressSnapshot {
  return {
    stage: "discovering",
    discovered: 0,
    skipped: 0,
    queuedFetch: 0,
    fetching: 0,
    queuedScore: 0,
    scoring: 0,
    matched: 0,
    rejected: 0,
    failed: 0,
    activeFetchCompanies: [],
    activeScoreCompanies: []
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }

  return response.text();
}

async function discoverSource(
  selectedSource: SelectedSource,
  fetchHtml: (url: string) => Promise<string>
): Promise<JobListing[]> {
  return selectedSource.adapter.discoverListings(selectedSource.config, fetchHtml);
}

function dedupeListings(listings: JobListing[]): JobListing[] {
  const uniqueListings = new Map<string, JobListing>();

  for (const listing of listings) {
    if (!uniqueListings.has(listing.externalId)) {
      uniqueListings.set(listing.externalId, listing);
    }
  }

  return [...uniqueListings.values()];
}

function createPipelineDependencies(
  config: RunConfig,
  overrides: Partial<PipelineDependencies> = {}
): PipelineDependencies {
  const defaultRepository = new SQLiteJobRepository(config.databasePath);
  const defaultCountStoredJobs = (): number => defaultRepository.listJobs().length;
  const missingCountStoredJobs = (): number => {
    throw new Error(
      "Pipeline countStoredJobs dependency is required when using a custom repository"
    );
  };
  const repository = overrides.repository ?? defaultRepository;
  let jina: JinaReaderClient | undefined;
  let matcher: DeepSeekMatcher | undefined;

  function ensureClients(): { jina: JinaReaderClient; matcher: DeepSeekMatcher } {
    if (!jina || !matcher) {
      const env = loadRuntimeEnv();
      jina = new JinaReaderClient(env.jinaApiKey);
      matcher = new DeepSeekMatcher(env.deepseekApiKey);
    }

    return { jina, matcher };
  }

  return {
    adapters: overrides.adapters ?? createSourceAdapters(),
    fetchListingHtml: overrides.fetchListingHtml ?? fetchText,
    loadResumeMarkdown:
      overrides.loadResumeMarkdown ??
      ((path: string) => readFile(path, "utf8")),
    fetchOfferMarkdown:
      overrides.fetchOfferMarkdown ??
      (async (url: string) => ensureClients().jina.fetchMarkdown(url)),
    scoreOffer:
      overrides.scoreOffer ??
      (async (job: JobOffer, resumeMarkdown: string) =>
        ensureClients().matcher.scoreOffer(job, resumeMarkdown)),
    countStoredJobs:
      overrides.countStoredJobs ??
      (overrides.repository ? missingCountStoredJobs : defaultCountStoredJobs),
    repository
  };
}

export async function runPipeline(
  config: RunConfig,
  progress?: ProgressReporter,
  dependencyOverrides: Partial<PipelineDependencies> = {},
  options: RunPipelineOptions = {}
): Promise<RunSummary> {
  const dependencies = createPipelineDependencies(config, dependencyOverrides);
  const snapshot = createProgressSnapshot();
  const activeFetchCompanies = new Map<string, string>();
  const activeScoreCompanies = new Map<string, string>();
  const emitSnapshot = (method: "start" | "update"): void => {
    if (!progress) {
      return;
    }

    const progressSnapshot: PipelineProgressSnapshot = {
      ...snapshot,
      activeFetchCompanies: Array.from(activeFetchCompanies.values()),
      activeScoreCompanies: Array.from(activeScoreCompanies.values())
    };

    progress[method](progressSnapshot);
  };
  const selectedSources = selectSources(
    config,
    dependencies.adapters,
    options.source
  );
  const discoveredListings = await Promise.all(
    selectedSources.map((selectedSource) =>
      discoverSource(selectedSource, dependencies.fetchListingHtml)
    )
  );
  const listings = dedupeListings(discoveredListings.flat());
  snapshot.discovered = listings.length;
  emitSnapshot("start");
  let resumeMarkdownPromise: Promise<string> | undefined;
  const getResumeMarkdown = async (): Promise<string> => {
    if (!resumeMarkdownPromise) {
      resumeMarkdownPromise = dependencies.loadResumeMarkdown(config.resumeMarkdownPath);
    }

    return resumeMarkdownPromise;
  };
  const summary: RunSummary = {
    scanned: listings.length,
    skipped: 0,
    fetched: 0,
    matched: 0,
    rejected: 0,
    failed: 0,
    stored: 0
  };
  const listingsToProcess: JobListing[] = [];

  for (const listing of listings) {
    dependencies.repository.upsertDiscoveredJob(listing);

    const currentStatus = dependencies.repository.getJobStatus(listing.externalId);
    if (currentStatus === "matched" || currentStatus === "rejected") {
      summary.skipped += 1;
      snapshot.skipped += 1;
      continue;
    }

    listingsToProcess.push(listing);
    snapshot.queuedFetch += 1;
  }
  emitSnapshot("update");

  if (listingsToProcess.length > 0) {
    await getResumeMarkdown();
  }

  const fetchWorkerCount = Math.max(config.fetchConcurrency, 1);
  const scoreWorkerCount = Math.max(config.scoreConcurrency, 1);
  const fetchQueue = new AsyncQueue<JobListing>(fetchWorkerCount);
  const scoreQueue = new AsyncQueue<JobOffer>(scoreWorkerCount);

  async function runFetchWorker(): Promise<void> {
    while (true) {
      const listing = await fetchQueue.dequeue();
      if (!listing) {
        return;
      }

      snapshot.stage = "fetching";
      snapshot.queuedFetch -= 1;
      snapshot.fetching += 1;
      activeFetchCompanies.set(listing.externalId, listing.company);
      emitSnapshot("update");

      let queuedForScore = false;

      try {
        dependencies.repository.markJobFetching(listing.externalId);
        const offerMarkdown = await dependencies.fetchOfferMarkdown(listing.url);
        dependencies.repository.saveFetchedOffer(listing.externalId, offerMarkdown);
        summary.fetched += 1;
        snapshot.fetching -= 1;
        activeFetchCompanies.delete(listing.externalId);
        snapshot.queuedScore += 1;
        queuedForScore = true;
        emitSnapshot("update");
        await scoreQueue.enqueue({ ...listing, offerMarkdown });
      } catch {
        if (queuedForScore) {
          snapshot.queuedScore -= 1;
        } else {
          snapshot.fetching -= 1;
          activeFetchCompanies.delete(listing.externalId);
        }

        dependencies.repository.markJobError(listing.externalId);
        summary.failed += 1;
        snapshot.failed += 1;
        emitSnapshot("update");
      }
    }
  }

  async function runScoreWorker(): Promise<void> {
    while (true) {
      const offer = await scoreQueue.dequeue();
      if (!offer) {
        return;
      }

      snapshot.stage = "scoring";
      snapshot.queuedScore -= 1;
      snapshot.scoring += 1;
      activeScoreCompanies.set(offer.externalId, offer.company);
      emitSnapshot("update");

      try {
        dependencies.repository.markJobScoring(offer.externalId);
        const resumeMarkdown = await getResumeMarkdown();
        const match = await dependencies.scoreOffer(offer, resumeMarkdown);
        const candidate: MatchCandidate = {
          job: offer,
          match: {
            ...match,
            shouldSave: match.score >= config.matchThreshold
          }
        };

        dependencies.repository.saveScoredJob(candidate);
        snapshot.scoring -= 1;
        activeScoreCompanies.delete(offer.externalId);
        if (candidate.match.shouldSave) {
          summary.matched += 1;
          snapshot.matched += 1;
        } else {
          summary.rejected += 1;
          snapshot.rejected += 1;
        }
        emitSnapshot("update");
      } catch {
        snapshot.scoring -= 1;
        activeScoreCompanies.delete(offer.externalId);
        dependencies.repository.markJobError(offer.externalId);
        summary.failed += 1;
        snapshot.failed += 1;
        emitSnapshot("update");
      }
    }
  }

  const scoreWorkers = Array.from({ length: scoreWorkerCount }, () => runScoreWorker());
  const fetchWorkers = Array.from({ length: fetchWorkerCount }, () => runFetchWorker());

  try {
    for (const listing of listingsToProcess) {
      await fetchQueue.enqueue(listing);
    }
  } finally {
    fetchQueue.close();
  }

  try {
    await Promise.all(fetchWorkers);
  } finally {
    scoreQueue.close();
  }

  await Promise.all(scoreWorkers);

  summary.stored = dependencies.countStoredJobs();
  snapshot.stage = "done";
  emitSnapshot("update");

  return summary;
}
