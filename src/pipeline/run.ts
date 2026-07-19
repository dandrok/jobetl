import { readFile } from "node:fs/promises";

import { loadRuntimeEnv } from "@core/env";
import { JinaReaderClient } from "@jina/client";
import { DeepSeekMatcher } from "@matching/deepseek-matcher";
import type { ProgressReporter } from "@progress/single-line-progress-reporter";
import { createSourceAdapters } from "@scrapers/index";
import { selectSources } from "@scrapers/select";
import type { SelectedSource, SourceAdapterMap } from "@scrapers/types";
import { PostgresJobRepository } from "@storage/postgres-job-repository";
import { AsyncQueue } from "@pipeline/async-queue";
import { shouldSkipJobForProfile } from "@pipeline/profile-skip";
import type {
  JobListing,
  JobOffer,
  JobSource,
  JobStatus,
  MatchCandidate,
  MatchResult,
  PipelineProgressSnapshot,
  ProfileRunConfig,
  StoredJob
} from "@core/types";

export interface RunSummary {
  scanned: number;
  skipped: number;
  fetched: number;
  matched: number;
  rejected: number;
  failed: number;
  stored: number;
  matchedCandidates: MatchCandidate[];
}

export interface PipelineRepository {
  upsertDiscoveredJob(job: JobListing): Promise<void>;
  getJobStatus(externalId: string): Promise<JobStatus | undefined>;
  getJob(externalId: string): Promise<StoredJob | undefined>;
  markJobFetching(externalId: string): Promise<void>;
  saveFetchedOffer(externalId: string, offerMarkdown: string): Promise<void>;
  markJobScoring(externalId: string): Promise<void>;
  markJobError(externalId: string): Promise<void>;
  saveScoredJob(candidate: MatchCandidate, profileId?: string): Promise<void>;
}

export interface PipelineDependencies {
  adapters: SourceAdapterMap;
  fetchListingHtml(url: string, init?: RequestInit): Promise<string>;
  loadResumeMarkdown(path: string): Promise<string>;
  fetchOfferMarkdown(url: string): Promise<string>;
  scoreOffer(job: JobOffer, resumeMarkdown: string): Promise<MatchResult>;
  countStoredJobs(): Promise<number>;
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

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }

  return response.text();
}

async function discoverSource(
  selectedSource: SelectedSource,
  fetchHtml: (url: string, init?: RequestInit) => Promise<string>
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
  config: ProfileRunConfig,
  overrides: Partial<PipelineDependencies> = {}
): PipelineDependencies {
  const defaultRepository = new PostgresJobRepository(config.databaseUrl);
  const defaultCountStoredJobs = async (): Promise<number> => {
    const jobs = await defaultRepository.listJobs();
    return jobs.length;
  };
  const missingCountStoredJobs = async (): Promise<number> => {
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
    loadResumeMarkdown: overrides.loadResumeMarkdown ?? ((path: string) => readFile(path, "utf8")),
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

function isFatalDeepSeekError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();
  return (
    lowerMsg.includes("401") ||
    lowerMsg.includes("402") ||
    lowerMsg.includes("403") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("payment required") ||
    lowerMsg.includes("api key") ||
    lowerMsg.includes("invalid key") ||
    lowerMsg.includes("insufficient balance") ||
    lowerMsg.includes("authentication")
  );
}

export async function runPipeline(
  config: ProfileRunConfig,
  progress?: ProgressReporter,
  dependencyOverrides: Partial<PipelineDependencies> = {},
  options: RunPipelineOptions = {}
): Promise<RunSummary> {
  const dependencies = createPipelineDependencies(config, dependencyOverrides);
  try {
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
    const selectedSources = selectSources(config, dependencies.adapters, options.source);
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
      stored: 0,
      matchedCandidates: []
    };
    const listingsToProcess: JobListing[] = [];

    const batchSize = 10;
    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (listing) => {
          await dependencies.repository.upsertDiscoveredJob(listing);
          const existing = await dependencies.repository.getJob(listing.externalId);
          const currentStatus = existing?.status;
          if (shouldSkipJobForProfile(currentStatus, existing?.profile, config.profileId)) {
            summary.skipped += 1;
            snapshot.skipped += 1;
          } else {
            listingsToProcess.push(listing);
            snapshot.queuedFetch += 1;
          }
        })
      );
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
        let preserveTerminalStatus = false;

        try {
          const existing = await dependencies.repository.getJob(listing.externalId);
          const isTerminal = existing?.status === "matched" || existing?.status === "rejected";
          preserveTerminalStatus = isTerminal;
          // Avoid wiping a prior profile match with intermediate statuses during re-score.
          if (!isTerminal) {
            await dependencies.repository.markJobFetching(listing.externalId);
          }
          const cachedMarkdown = existing?.offerMarkdown?.trim();
          const offerMarkdown =
            cachedMarkdown && cachedMarkdown.length > 0
              ? cachedMarkdown
              : await dependencies.fetchOfferMarkdown(listing.url);
          if (!cachedMarkdown) {
            await dependencies.repository.saveFetchedOffer(listing.externalId, offerMarkdown);
            summary.fetched += 1;
          }

          snapshot.fetching -= 1;
          activeFetchCompanies.delete(listing.externalId);
          snapshot.queuedScore += 1;
          queuedForScore = true;
          emitSnapshot("update");
          await scoreQueue.enqueue({ ...listing, offerMarkdown });
        } catch (error) {
          if (queuedForScore) {
            snapshot.queuedScore -= 1;
          } else {
            snapshot.fetching -= 1;
            activeFetchCompanies.delete(listing.externalId);
          }

          if (!preserveTerminalStatus) {
            try {
              await dependencies.repository.markJobError(listing.externalId);
            } catch (markError) {
              console.error(
                `\nFailed to mark job error for ${listing.company} (${listing.url}):`,
                markError instanceof Error ? markError.message : String(markError)
              );
            }
          }
          summary.failed += 1;
          snapshot.failed += 1;
          emitSnapshot("update");
          console.error(
            `\nFailed to fetch offer for ${listing.company} (${listing.url}):`,
            error instanceof Error ? error.message : String(error)
          );
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

        let preserveTerminalStatus = false;
        try {
          const existingForScore = await dependencies.repository.getJob(offer.externalId);
          const isTerminal =
            existingForScore?.status === "matched" || existingForScore?.status === "rejected";
          preserveTerminalStatus = isTerminal;
          if (!isTerminal) {
            await dependencies.repository.markJobScoring(offer.externalId);
          }
          const resumeMarkdown = await getResumeMarkdown();
          const match = await dependencies.scoreOffer(offer, resumeMarkdown);
          const candidate: MatchCandidate = {
            job: offer,
            match: {
              ...match,
              shouldSave: match.score >= config.matchThreshold
            }
          };

          await dependencies.repository.saveScoredJob(candidate, config.profileId);
          snapshot.scoring -= 1;
          activeScoreCompanies.delete(offer.externalId);
          if (candidate.match.shouldSave) {
            summary.matched += 1;
            snapshot.matched += 1;
            summary.matchedCandidates.push(candidate);
          } else {
            summary.rejected += 1;
            snapshot.rejected += 1;
          }
          emitSnapshot("update");
        } catch (error) {
          snapshot.scoring -= 1;
          activeScoreCompanies.delete(offer.externalId);
          if (!preserveTerminalStatus) {
            try {
              await dependencies.repository.markJobError(offer.externalId);
            } catch (markError) {
              console.error(
                `\nFailed to mark job error for ${offer.company} (${offer.url}):`,
                markError instanceof Error ? markError.message : String(markError)
              );
            }
          }
          summary.failed += 1;
          snapshot.failed += 1;
          emitSnapshot("update");
          console.error(
            `\nFailed to score offer for ${offer.company} (${offer.url}):`,
            error instanceof Error ? error.message : String(error)
          );

          if (isFatalDeepSeekError(error)) {
            throw new Error(
              `Fatal DeepSeek API Error: ${error instanceof Error ? error.message : String(error)}. Aborting pipeline.`,
              { cause: error }
            );
          }
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

    summary.stored = await dependencies.countStoredJobs();
    snapshot.stage = "done";
    emitSnapshot("update");

    return summary;
  } finally {
    if (!dependencyOverrides.repository) {
      await dependencies.repository.close();
    }
  }
}
