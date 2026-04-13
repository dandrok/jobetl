import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SQLiteJobRepository } from "../src/storage/sqlite-job-repository.js";
import type { MatchCandidate } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createRepository() {
  const dir = mkdtempSync(join(tmpdir(), "jobetl-"));
  tempDirs.push(dir);
  const databasePath = join(dir, "jobetl.db");

  return new SQLiteJobRepository(databasePath);
}

describe("SQLiteJobRepository", () => {
  test("stores discovered listings only once and updates existing rows", () => {
    const repository = createRepository();

    repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote"
    });

    repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme Updated",
      salaryText: "21 000 - 29 000 PLN/month",
      location: "Remote"
    });

    const jobs = repository.listJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme",
      company: "Acme Updated",
      status: "discovered",
      salaryText: "21 000 - 29 000 PLN/month"
    });
  });

  test("returns job status for skip decisions and undefined for missing jobs", () => {
    const repository = createRepository();

    repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme"
    });

    expect(repository.getJobStatus("justjoinit:/job-offer/acme")).toBe("discovered");
    expect(repository.getJobStatus("justjoinit:/job-offer/missing")).toBeUndefined();
  });

  test("moves a job through fetching, fetched, scoring, and error states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

    const repository = createRepository();
    const externalId = "justjoinit:/job-offer/acme";

    repository.upsertDiscoveredJob({
      externalId,
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote"
    });

    const discoveredRow = repository.listJobs()[0];
    expect(discoveredRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      status: "discovered"
    });

    vi.setSystemTime(new Date("2024-01-01T00:00:01.000Z"));
    repository.markJobFetching(externalId);
    const fetchingRow = repository.listJobs()[0];
    expect(fetchingRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      status: "fetching"
    });
    expect(fetchingRow.updatedAt).not.toBe(discoveredRow.updatedAt);
    expect(repository.getJobStatus(externalId)).toBe("fetching");

    vi.setSystemTime(new Date("2024-01-01T00:00:02.000Z"));
    repository.saveFetchedOffer(externalId, "# Offer");
    const fetchedRow = repository.listJobs()[0];
    expect(fetchedRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: "# Offer",
      status: "fetched"
    });
    expect(repository.getJobStatus(externalId)).toBe("fetched");

    vi.setSystemTime(new Date("2024-01-01T00:00:03.000Z"));
    repository.markJobScoring(externalId);
    const scoringRow = repository.listJobs()[0];
    expect(scoringRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: "# Offer",
      status: "scoring"
    });
    expect(repository.getJobStatus(externalId)).toBe("scoring");

    vi.setSystemTime(new Date("2024-01-01T00:00:04.000Z"));
    repository.markJobError(externalId);
    const errorRow = repository.listJobs()[0];
    expect(errorRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: "# Offer",
      status: "error"
    });
    expect(repository.getJobStatus(externalId)).toBe("error");

    vi.useRealTimers();
  });

  test("persists scoring results for later local review", () => {
    const repository = createRepository();
    const candidate: MatchCandidate = {
      job: {
        externalId: "justjoinit:/job-offer/acme",
        source: "justjoinit",
        url: "https://justjoin.it/job-offer/acme",
        title: "Senior Node Engineer",
        company: "Acme",
        salaryText: "20 000 - 28 000 PLN/month",
        location: "Remote",
        offerMarkdown: "# Offer"
      },
      match: {
        score: 0.91,
        reason: "Strong overlap in Node.js, automation, and ETL.",
        summary: "Backend data platform role with strong Node.js fit.",
        shouldSave: true
      }
    };

    repository.upsertDiscoveredJob(candidate.job);
    repository.saveScoredJob(candidate);

    const matches = repository.listMatchedJobs();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme",
      status: "matched",
      matchScore: 0.91,
      matchReason: "Strong overlap in Node.js, automation, and ETL.",
      summary: "Backend data platform role with strong Node.js fit."
    });
  });
});
