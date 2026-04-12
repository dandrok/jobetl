import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";

import { SQLiteJobRepository } from "../src/storage/sqlite-job-repository.js";
import type { MatchCandidate } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
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
