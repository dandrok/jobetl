import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";

import { formatPipelineProgressText } from "../src/progress/formatters.js";
import {
  runPipeline,
  type PipelineDependencies,
  type PipelineRepository
} from "../src/pipeline/run.js";
import type { SourceAdapterMap } from "../src/sources/types.js";
import type {
  JobListing,
  JobOffer,
  JobSource,
  JobStatus,
  MatchResult,
  PipelineProgressSnapshot,
  RunConfig,
  StoredJob
} from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  vi.doUnmock("../src/pipeline/async-queue.js");
  vi.resetModules();
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jobetl-pipeline-"));
  tempDirs.push(dir);
  return dir;
}

function createConfig(): RunConfig {
  const dir = createTempDir();
  const resumeMarkdownPath = join(dir, "resume.md");
  writeFileSync(resumeMarkdownPath, "# Resume\n\nNode.js and ETL");

  return {
    databasePath: join(dir, "jobetl.db"),
    resumeMarkdownPath,
    matchThreshold: 0.75,
    fetchConcurrency: 1,
    scoreConcurrency: 1,
    sources: {
      justjoinit: {
        enabled: true,
        baseUrl: "https://justjoin.it",
        filters: {
          keyword: "node"
        },
        maxListings: 10
      },
      nofluffjobs: {
        enabled: true,
        baseUrl: "https://nofluffjobs.com",
        filters: {
          keyword: "javascript",
          location: "warszawa"
        },
        maxListings: 10
      },
      bulldogjob: {
        enabled: true,
        baseUrl: "https://bulldogjob.com",
        filters: {
          keyword: "JavaScript"
        },
        maxListings: 10
      }
    }
  };
}

function createListing(id: string, source: JobSource = "justjoinit"): JobListing {
  const path =
    source === "justjoinit"
      ? `/job-offer/${id}`
      : source === "nofluffjobs"
        ? `/pl/job/${id}`
        : `/companies/jobs/${id}`;
  const url =
    source === "justjoinit"
      ? `https://justjoin.it${path}`
      : source === "nofluffjobs"
        ? `https://nofluffjobs.com${path}`
        : `https://bulldogjob.com${path}`;

  return {
    externalId: `${source}:${path}`,
    source,
    url,
    title: `Role ${id}`,
    company: `Company ${id}`,
    location: "Remote"
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

function createMatchResult(score: number): MatchResult {
  return {
    score,
    reason: `Scored ${score}`,
    summary: `Summary ${score}`,
    // runPipeline recomputes shouldSave from the configured threshold.
    shouldSave: false
  };
}

function createRepository(
  initialJobs: Array<{ listing: JobListing; status: JobStatus }> = []
): PipelineRepository & {
  jobs: Map<string, StoredJob>;
  operations: string[];
} {
  const jobs = new Map<string, StoredJob>();
  const operations: string[] = [];

  for (const { listing, status } of initialJobs) {
    jobs.set(listing.externalId, createStoredJob(listing, status));
  }

  function updateJob(externalId: string, changes: Partial<StoredJob>): void {
    const existing = jobs.get(externalId);

    if (!existing) {
      throw new Error(`Missing job ${externalId}`);
    }

    jobs.set(externalId, {
      ...existing,
      ...changes,
      updatedAt: new Date().toISOString()
    });
  }

  return {
    jobs,
    operations,
    upsertDiscoveredJob(job) {
      operations.push(`upsert:${job.externalId}`);
      const existing = jobs.get(job.externalId);

      jobs.set(
        job.externalId,
        existing
          ? {
              ...existing,
              ...job,
              updatedAt: new Date().toISOString()
            }
          : createStoredJob(job, "discovered")
      );
    },
    getJobStatus(externalId) {
      operations.push(`status:${externalId}`);
      return jobs.get(externalId)?.status;
    },
    markJobFetching(externalId) {
      operations.push(`fetching:${externalId}`);
      updateJob(externalId, { status: "fetching" });
    },
    saveFetchedOffer(externalId, offerMarkdown) {
      operations.push(`fetched:${externalId}`);
      updateJob(externalId, { offerMarkdown, status: "fetched" });
    },
    markJobScoring(externalId) {
      operations.push(`scoring:${externalId}`);
      updateJob(externalId, { status: "scoring" });
    },
    markJobError(externalId) {
      operations.push(`error:${externalId}`);
      updateJob(externalId, { status: "error" });
    },
    saveScoredJob(candidate) {
      operations.push(`scored:${candidate.job.externalId}`);
      updateJob(candidate.job.externalId, {
        offerMarkdown: candidate.job.offerMarkdown,
        matchScore: candidate.match.score,
        matchReason: candidate.match.reason,
        summary: candidate.match.summary,
        status: candidate.match.shouldSave ? "matched" : "rejected"
      });
    }
  };
}

function createStoredJob(listing: JobListing, status: JobStatus): StoredJob {
  const timestamp = new Date().toISOString();

  return {
    ...listing,
    status,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createAdapters(
  listingsBySource: Partial<Record<JobSource, JobListing[]>> = {}
): SourceAdapterMap {
  return {
    justjoinit: {
      source: "justjoinit",
      discoverListings: vi.fn(async () => listingsBySource.justjoinit ?? [])
    },
    nofluffjobs: {
      source: "nofluffjobs",
      discoverListings: vi.fn(async () => listingsBySource.nofluffjobs ?? [])
    },
    bulldogjob: {
      source: "bulldogjob",
      discoverListings: vi.fn(async () => listingsBySource.bulldogjob ?? [])
    }
  };
}

function createDependencies(
  repository: PipelineRepository & { jobs: Map<string, StoredJob> },
  listingsOrAdapters: JobListing[] | SourceAdapterMap,
  overrides: Partial<PipelineDependencies> = {}
): PipelineDependencies {
  const loadResumeMarkdown =
    overrides.loadResumeMarkdown ?? vi.fn(async () => "# Resume\n\nNode.js and ETL");
  const countStoredJobs =
    overrides.countStoredJobs ?? vi.fn(() => repository.jobs.size);
  const adapters = Array.isArray(listingsOrAdapters)
    ? createAdapters({ justjoinit: listingsOrAdapters })
    : listingsOrAdapters;

  return {
    adapters: overrides.adapters ?? adapters,
    fetchListingHtml: overrides.fetchListingHtml ?? vi.fn(async () => "<html />"),
    loadResumeMarkdown,
    fetchOfferMarkdown:
      overrides.fetchOfferMarkdown ??
      vi.fn(async (url: string) => `# Markdown for ${url}`),
    scoreOffer:
      overrides.scoreOffer ??
      vi.fn(async (_job: JobOffer, _resumeMarkdown: string) => createMatchResult(0.9)),
    countStoredJobs,
    repository
  };
}

describe("runPipeline", () => {
  test("dedupes repeated listings discovered in the same run before fetch and score", async () => {
    const config = createConfig();
    const repository = createRepository();
    const repeatedListing = createListing("nfj-dup", "nofluffjobs");
    const uniqueListing = createListing("nfj-unique", "nofluffjobs");
    const adapters = createAdapters({
      nofluffjobs: [repeatedListing, repeatedListing, uniqueListing]
    });
    const fetchOfferMarkdown = vi.fn(async () => "# Offer");
    const scoreOffer = vi.fn(async () => createMatchResult(0.9));
    const dependencies = createDependencies(repository, adapters, {
      fetchOfferMarkdown,
      scoreOffer
    });

    const summary = await runPipeline(config, undefined, dependencies, {
      source: "nofluffjobs"
    });

    expect(summary).toMatchObject({
      scanned: 2,
      fetched: 2,
      matched: 2
    });
    expect(fetchOfferMarkdown).toHaveBeenCalledTimes(2);
    expect(scoreOffer).toHaveBeenCalledTimes(2);
    expect(
      repository.operations.filter(
        (operation) => operation === `upsert:${repeatedListing.externalId}`
      )
    ).toHaveLength(1);
  });

  test("discovers listings from all enabled sources before entering shared fetch and score queues", async () => {
    const config = createConfig();
    const repository = createRepository();
    const adapters = createAdapters({
      justjoinit: [createListing("jji-1", "justjoinit")],
      nofluffjobs: [createListing("nfj-1", "nofluffjobs")]
    });
    const fetchOfferMarkdown = vi.fn(async () => "# Offer");
    const scoreOffer = vi.fn(async () => createMatchResult(0.9));
    const dependencies = createDependencies(repository, adapters, {
      fetchOfferMarkdown,
      scoreOffer
    });

    const summary = await runPipeline(config, undefined, dependencies);

    expect(summary).toMatchObject({
      scanned: 2,
      fetched: 2,
      matched: 2
    });
    expect(adapters.justjoinit.discoverListings).toHaveBeenCalledTimes(1);
    expect(adapters.nofluffjobs.discoverListings).toHaveBeenCalledTimes(1);
    expect(fetchOfferMarkdown).toHaveBeenCalledTimes(2);
    expect(scoreOffer).toHaveBeenCalledTimes(2);
  });

  test("uses the optional source filter to skip discovery for other sources", async () => {
    const config = createConfig();
    const repository = createRepository();
    const adapters = createAdapters({
      justjoinit: [createListing("jji-1", "justjoinit")],
      nofluffjobs: [createListing("nfj-1", "nofluffjobs")]
    });
    const dependencies = createDependencies(repository, adapters);

    const summary = await runPipeline(
      config,
      undefined,
      dependencies,
      { source: "nofluffjobs" }
    );

    expect(summary.scanned).toBe(1);
    expect(adapters.justjoinit.discoverListings).not.toHaveBeenCalled();
    expect(adapters.nofluffjobs.discoverListings).toHaveBeenCalledTimes(1);
  });

  test("runs only bulldogjob discovery when the bulldogjob source filter is selected", async () => {
    const config = createConfig();
    const repository = createRepository();
    const adapters = createAdapters({
      bulldogjob: [createListing("bdj-1", "bulldogjob")],
      justjoinit: [createListing("jji-1", "justjoinit")],
      nofluffjobs: [createListing("nfj-1", "nofluffjobs")]
    });
    const dependencies = createDependencies(repository, adapters);

    const summary = await runPipeline(
      config,
      undefined,
      dependencies,
      { source: "bulldogjob" }
    );

    expect(summary.scanned).toBe(1);
    expect(adapters.justjoinit.discoverListings).not.toHaveBeenCalled();
    expect(adapters.nofluffjobs.discoverListings).not.toHaveBeenCalled();
    expect(adapters.bulldogjob.discoverListings).toHaveBeenCalledTimes(1);
  });

  test("skips jobs already finalized as matched or rejected after upserting them", async () => {
    const config = createConfig();
    const matchedListing = createListing("matched");
    const rejectedListing = createListing("rejected");
    const freshListing = createListing("fresh");
    const repository = createRepository([
      { listing: matchedListing, status: "matched" },
      { listing: rejectedListing, status: "rejected" }
    ]);
    const fetchOfferMarkdown = vi.fn(async (url: string) => `# ${url}`);
    const scoreOffer = vi.fn(async () => createMatchResult(0.2));
    const dependencies = createDependencies(repository, [
      matchedListing,
      rejectedListing,
      freshListing
    ], {
      fetchOfferMarkdown,
      scoreOffer
    });

    const summary = await runPipeline(config, undefined, dependencies);

    expect(summary).toEqual({
      scanned: 3,
      skipped: 2,
      fetched: 1,
      matched: 0,
      rejected: 1,
      failed: 0,
      stored: 3
    });
    expect(fetchOfferMarkdown).toHaveBeenCalledTimes(1);
    expect(fetchOfferMarkdown).toHaveBeenCalledWith(freshListing.url);
    expect(scoreOffer).toHaveBeenCalledTimes(1);
    expect(repository.operations).toContain(`upsert:${matchedListing.externalId}`);
    expect(repository.operations).toContain(`status:${matchedListing.externalId}`);
    expect(repository.operations).not.toContain(`fetching:${matchedListing.externalId}`);
    expect(repository.operations).not.toContain(`scoring:${matchedListing.externalId}`);
    expect(repository.operations).toContain(`upsert:${rejectedListing.externalId}`);
    expect(repository.operations).toContain(`status:${rejectedListing.externalId}`);
    expect(repository.operations).not.toContain(`fetching:${rejectedListing.externalId}`);
    expect(repository.operations).not.toContain(`scoring:${rejectedListing.externalId}`);
    expect(repository.operations).toContain(`scored:${freshListing.externalId}`);
  });

  test("does not load resume markdown when every discovered job is skipped", async () => {
    const config = createConfig();
    const matchedListing = createListing("matched");
    const rejectedListing = createListing("rejected");
    const repository = createRepository([
      { listing: matchedListing, status: "matched" },
      { listing: rejectedListing, status: "rejected" }
    ]);
    const loadResumeMarkdown = vi.fn(async () => "# Resume should stay unread");
    const dependencies = createDependencies(repository, [matchedListing, rejectedListing], {
      loadResumeMarkdown
    });

    const summary = await runPipeline(config, undefined, dependencies);

    expect(summary).toEqual({
      scanned: 2,
      skipped: 2,
      fetched: 0,
      matched: 0,
      rejected: 0,
      failed: 0,
      stored: 2
    });
    expect(loadResumeMarkdown).not.toHaveBeenCalled();
  });

  test("fails the run globally when resume markdown cannot be loaded for processable jobs", async () => {
    const config = createConfig();
    const listing = createListing("resume-required");
    const repository = createRepository();
    const loadResumeMarkdown = vi.fn(async () => {
      throw new Error("resume missing");
    });
    const fetchOfferMarkdown = vi.fn(async () => "# Offer");
    const scoreOffer = vi.fn(async () => createMatchResult(0.9));
    const dependencies = createDependencies(repository, [listing], {
      loadResumeMarkdown,
      fetchOfferMarkdown,
      scoreOffer
    });

    await expect(runPipeline(config, undefined, dependencies)).rejects.toThrow(
      "resume missing"
    );
    expect(loadResumeMarkdown).toHaveBeenCalledWith(config.resumeMarkdownPath);
    expect(fetchOfferMarkdown).not.toHaveBeenCalled();
    expect(scoreOffer).not.toHaveBeenCalled();
    expect(repository.jobs.get(listing.externalId)?.status).toBe("discovered");
  });

  test("retries jobs previously stored with error status", async () => {
    const config = createConfig();
    config.resumeMarkdownPath = join(createTempDir(), "missing-resume.md");
    const listing = createListing("retry-me");
    const repository = createRepository([{ listing, status: "error" }]);
    const fetchOfferMarkdown = vi.fn(async () => "# Retry offer");
    const scoreOffer = vi.fn(async () => createMatchResult(0.94));
    const loadResumeMarkdown = vi.fn(async () => "# Resume retry");
    const countStoredJobs = vi.fn(() => repository.jobs.size);
    const dependencies = createDependencies(repository, [listing], {
      fetchOfferMarkdown,
      scoreOffer,
      loadResumeMarkdown,
      countStoredJobs
    });

    const summary = await runPipeline(config, undefined, dependencies);

    expect(summary).toEqual({
      scanned: 1,
      skipped: 0,
      fetched: 1,
      matched: 1,
      rejected: 0,
      failed: 0,
      stored: 1
    });
    expect(fetchOfferMarkdown).toHaveBeenCalledTimes(1);
    expect(scoreOffer).toHaveBeenCalledTimes(1);
    expect(loadResumeMarkdown).toHaveBeenCalledWith(config.resumeMarkdownPath);
    expect(countStoredJobs).toHaveBeenCalledTimes(1);
    expect(repository.jobs.get(listing.externalId)?.status).toBe("matched");
  });

  test("continues after a failed score, marks the job as error, and counts it in failed", async () => {
    const config = createConfig();
    const brokenListing = createListing("broken-score");
    const healthyListing = createListing("healthy-score");
    const repository = createRepository();
    const scoreOffer = vi.fn(async (job: JobOffer) => {
      if (job.externalId === brokenListing.externalId) {
        throw new Error("score exploded");
      }

      return createMatchResult(0.88);
    });
    const dependencies = createDependencies(repository, [brokenListing, healthyListing], {
      scoreOffer
    });

    const summary = await runPipeline(config, undefined, dependencies);

    expect(summary).toEqual({
      scanned: 2,
      skipped: 0,
      fetched: 2,
      matched: 1,
      rejected: 0,
      failed: 1,
      stored: 2
    });
    expect(scoreOffer).toHaveBeenCalledTimes(2);
    expect(repository.jobs.get(brokenListing.externalId)?.status).toBe("error");
    expect(repository.jobs.get(healthyListing.externalId)?.status).toBe("matched");
  });

  test("continues after a failed fetch, marks the job as error, and processes the rest", async () => {
    const config = createConfig();
    const brokenListing = createListing("broken-fetch");
    const healthyListing = createListing("healthy-fetch");
    const repository = createRepository();
    const fetchOfferMarkdown = vi.fn(async (url: string) => {
      if (url === brokenListing.url) {
        throw new Error("fetch exploded");
      }

      return "# Healthy offer";
    });
    const dependencies = createDependencies(repository, [brokenListing, healthyListing], {
      fetchOfferMarkdown,
      scoreOffer: vi.fn(async () => createMatchResult(0.81))
    });

    const summary = await runPipeline(config, undefined, dependencies);

    expect(summary).toEqual({
      scanned: 2,
      skipped: 0,
      fetched: 1,
      matched: 1,
      rejected: 0,
      failed: 1,
      stored: 2
    });
    expect(fetchOfferMarkdown).toHaveBeenCalledTimes(2);
    expect(repository.jobs.get(brokenListing.externalId)?.status).toBe("error");
    expect(repository.jobs.get(healthyListing.externalId)?.status).toBe("matched");
  });

  test("emits snapshot progress across discovery, active work, and done", async () => {
    const config = createConfig();
    const skippedListing = createListing("skip-me");
    const freshListing = createListing("process-me");
    const repository = createRepository([
      { listing: skippedListing, status: "matched" }
    ]);
    const fetchDeferred = createDeferred<string>();
    const scoreDeferred = createDeferred<MatchResult>();
    const snapshots: PipelineProgressSnapshot[] = [];
    const progress = {
      start: vi.fn((snapshot: PipelineProgressSnapshot) => {
        snapshots.push(snapshot);
      }),
      update: vi.fn((snapshot: PipelineProgressSnapshot) => {
        snapshots.push(snapshot);
      }),
      succeed: vi.fn(),
      fail: vi.fn()
    };
    const dependencies = createDependencies(repository, [skippedListing, freshListing], {
      fetchOfferMarkdown: vi.fn(async () => fetchDeferred.promise),
      scoreOffer: vi.fn(async () => scoreDeferred.promise)
    });

    const pipelinePromise = runPipeline(config, progress, dependencies);

    await vi.waitFor(() => {
      expect(progress.start).toHaveBeenCalledTimes(1);
      expect(progress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "fetching",
          discovered: 2,
          skipped: 1,
          queuedFetch: 0,
          fetching: 1,
          queuedScore: 0,
          scoring: 0,
          matched: 0,
          rejected: 0,
          failed: 0,
          activeFetchCompanies: [freshListing.company],
          activeScoreCompanies: []
        })
      );
    });

    expect(progress.start).toHaveBeenCalledWith({
      stage: "discovering",
      discovered: 2,
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
    });
    expect(snapshots).toContainEqual({
      stage: "discovering",
      discovered: 2,
      skipped: 1,
      queuedFetch: 1,
      fetching: 0,
      queuedScore: 0,
      scoring: 0,
      matched: 0,
      rejected: 0,
      failed: 0,
      activeFetchCompanies: [],
      activeScoreCompanies: []
    });
    expect(
      formatPipelineProgressText(
        snapshots.find(
          (snapshot) =>
            snapshot.stage === "discovering" &&
            snapshot.queuedFetch === 1 &&
            snapshot.fetching === 0
        )!
      )
    ).toContain("stage: fetching");

    fetchDeferred.resolve("# Offer");

    await vi.waitFor(() => {
      expect(progress.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "scoring",
          discovered: 2,
          skipped: 1,
          queuedFetch: 0,
          fetching: 0,
          queuedScore: 0,
          scoring: 1,
          matched: 0,
          rejected: 0,
          failed: 0,
          activeFetchCompanies: [],
          activeScoreCompanies: [freshListing.company]
        })
      );
    });
    expect(
      formatPipelineProgressText(
        snapshots.find(
          (snapshot) =>
            snapshot.stage === "fetching" &&
            snapshot.queuedScore === 1 &&
            snapshot.scoring === 0
        )!
      )
    ).toContain("stage: scoring");

    scoreDeferred.resolve(createMatchResult(0.91));

    const summary = await pipelinePromise;

    expect(summary).toEqual({
      scanned: 2,
      skipped: 1,
      fetched: 1,
      matched: 1,
      rejected: 0,
      failed: 0,
      stored: 2
    });
    expect(snapshots.at(-1)).toEqual({
      stage: "done",
      discovered: 2,
      skipped: 1,
      queuedFetch: 0,
      fetching: 0,
      queuedScore: 0,
      scoring: 0,
      matched: 1,
      rejected: 0,
      failed: 0,
      activeFetchCompanies: [],
      activeScoreCompanies: []
    });
  });

  test("overlaps fetch and score stages while respecting bounded fetch concurrency", async () => {
    const config = createConfig();
    config.fetchConcurrency = 2;
    config.scoreConcurrency = 1;

    const listings = [
      createListing("overlap-a"),
      createListing("overlap-b"),
      createListing("overlap-c")
    ];
    const repository = createRepository();
    const fetchDeferreds = new Map(
      listings.map((listing) => [listing.url, createDeferred<string>()])
    );
    const scoreDeferred = createDeferred<MatchResult>();
    const events: string[] = [];
    let activeFetches = 0;
    let maxActiveFetches = 0;
    let activeScores = 0;
    let maxActiveScores = 0;

    const fetchOfferMarkdown = vi.fn(async (url: string) => {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      events.push(`fetch:start:${url}`);

      try {
        return await fetchDeferreds.get(url)!.promise;
      } finally {
        activeFetches -= 1;
        events.push(`fetch:end:${url}`);
      }
    });

    const scoreOffer = vi.fn(async (job: JobOffer) => {
      activeScores += 1;
      maxActiveScores = Math.max(maxActiveScores, activeScores);
      events.push(`score:start:${job.externalId}`);

      try {
        if (job.externalId === listings[0].externalId) {
          const result = await scoreDeferred.promise;
          events.push(`score:end:${job.externalId}`);
          return result;
        }

        events.push(`score:end:${job.externalId}`);
        return createMatchResult(0.86);
      } finally {
        activeScores -= 1;
      }
    });

    const dependencies = createDependencies(repository, listings, {
      fetchOfferMarkdown,
      scoreOffer
    });

    const pipelinePromise = runPipeline(config, undefined, dependencies);

    await vi.waitFor(() => {
      expect(fetchOfferMarkdown).toHaveBeenCalledTimes(2);
    });
    expect(scoreOffer).not.toHaveBeenCalled();

    fetchDeferreds.get(listings[0].url)?.resolve("# Offer A");

    await vi.waitFor(() => {
      expect(scoreOffer).toHaveBeenCalledTimes(1);
    });

    expect(events).toContain(`fetch:start:${listings[1].url}`);
    expect(events).toContain(`score:start:${listings[0].externalId}`);
    expect(events).not.toContain(`fetch:end:${listings[1].url}`);
    expect(maxActiveFetches).toBe(2);
    expect(scoreOffer).toHaveBeenCalledTimes(1);
    expect(events).not.toContain(`score:start:${listings[1].externalId}`);

    fetchDeferreds.get(listings[1].url)?.resolve("# Offer B");

    await vi.waitFor(() => {
      expect(fetchOfferMarkdown).toHaveBeenCalledTimes(3);
    });
    expect(scoreOffer).toHaveBeenCalledTimes(1);
    expect(events).not.toContain(`score:start:${listings[1].externalId}`);

    scoreDeferred.resolve(createMatchResult(0.91));

    await vi.waitFor(() => {
      expect(scoreOffer).toHaveBeenCalledTimes(2);
    });

    fetchDeferreds.get(listings[2].url)?.resolve("# Offer C");

    const summary = await pipelinePromise;

    expect(summary).toEqual({
      scanned: 3,
      skipped: 0,
      fetched: 3,
      matched: 3,
      rejected: 0,
      failed: 0,
      stored: 3
    });
    expect(maxActiveFetches).toBe(2);
    expect(maxActiveScores).toBe(1);
  });

  test("closes the score queue when a fetch worker exits abnormally", async () => {
    const config = createConfig();
    const listing = createListing("abnormal-fetch-exit");
    const repository = createRepository();
    const dependencies = createDependencies(repository, [listing]);
    let scoreQueueCloseCount = 0;
    let queueInstanceCount = 0;

    vi.doMock("../src/pipeline/async-queue.js", () => {
      return {
        AsyncQueue: class MockAsyncQueue<T> {
          private readonly items: T[] = [];
          private readonly pendingDequeues: Array<(item: T | undefined) => void> = [];
          private readonly isFetchQueue: boolean;

          constructor(_capacity: number) {
            queueInstanceCount += 1;
            this.isFetchQueue = queueInstanceCount === 1;
          }

          async enqueue(item: T): Promise<void> {
            const pendingDequeue = this.pendingDequeues.shift();
            if (pendingDequeue) {
              pendingDequeue(item);
              return;
            }

            this.items.push(item);
          }

          async dequeue(): Promise<T | undefined> {
            if (this.isFetchQueue) {
              throw new Error("fetch worker exploded");
            }

            const item = this.items.shift();
            if (item !== undefined) {
              return item;
            }

            return new Promise<T | undefined>((resolve) => {
              this.pendingDequeues.push(resolve);
            });
          }

          close(): void {
            if (!this.isFetchQueue) {
              scoreQueueCloseCount += 1;
            }

            while (this.pendingDequeues.length > 0) {
              const pendingDequeue = this.pendingDequeues.shift();
              pendingDequeue?.(undefined);
            }
          }
        }
      };
    });

    const { runPipeline: runPipelineWithMockedQueue } = await import("../src/pipeline/run.js");

    await expect(
      runPipelineWithMockedQueue(config, undefined, dependencies)
    ).rejects.toThrow("fetch worker exploded");
    expect(scoreQueueCloseCount).toBe(1);
  });
});
