import { beforeEach, describe, expect, test, afterAll } from "vitest";
import postgres from "postgres";

import { PostgresJobRepository } from "@storage/postgres-job-repository";
import type { MatchCandidate } from "@core/types";

const connectionString = "postgres://jobetl_user:secure_password_here@localhost:5432/jobetl_test";
const sql = postgres(connectionString);
const repository = new PostgresJobRepository(connectionString);

beforeEach(async () => {
  // Clean the database before each test
  await sql`TRUNCATE TABLE jobs CASCADE`;
});

afterAll(async () => {
  await repository.close();
  await sql.end();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("PostgresJobRepository", () => {
  test("stores discovered listings only once and updates existing rows", async () => {
    await repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote"
    });

    await repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme Updated",
      salaryText: "21 000 - 29 000 PLN/month",
      location: "Remote"
    });

    const jobs = await repository.listJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme",
      company: "Acme Updated",
      status: "discovered",
      salaryText: "21 000 - 29 000 PLN/month"
    });
  });

  test("does not bump updatedAt when rediscovered listing data is unchanged", async () => {
    const listing = {
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit" as const,
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote"
    };

    await repository.upsertDiscoveredJob(listing);
    const jobs1 = await repository.listJobs();
    const firstUpdatedAt = jobs1[0].updatedAt;

    await sleep(2);
    await repository.upsertDiscoveredJob(listing);

    const jobs2 = await repository.listJobs();
    expect(jobs2[0]).toMatchObject({
      externalId: listing.externalId,
      updatedAt: firstUpdatedAt
    });
  });

  test("bumps updatedAt when rediscovered listing data changed", async () => {
    await repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote"
    });
    const jobs1 = await repository.listJobs();
    const firstUpdatedAt = jobs1[0].updatedAt;

    await sleep(2);
    await repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme Updated",
      salaryText: "22 000 - 30 000 PLN/month",
      location: "Remote"
    });

    const jobs2 = await repository.listJobs();
    expect(jobs2[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme",
      company: "Acme Updated",
      salaryText: "22 000 - 30 000 PLN/month"
    });
    expect(jobs2[0].updatedAt).not.toBe(firstUpdatedAt);
  });

  test("returns job status for skip decisions and undefined for missing jobs", async () => {
    await repository.upsertDiscoveredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme"
    });

    expect(await repository.getJobStatus("justjoinit:/job-offer/acme")).toBe("discovered");
    expect(await repository.getJobStatus("justjoinit:/job-offer/missing")).toBeUndefined();
  });

  test("moves a job through fetching, fetched, scoring, and error states", async () => {
    const externalId = "justjoinit:/job-offer/acme";

    await repository.upsertDiscoveredJob({
      externalId,
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote"
    });

    const discoveredJobs = await repository.listJobs();
    const discoveredRow = discoveredJobs[0];
    expect(discoveredRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      status: "discovered"
    });

    await sleep(2);
    await repository.markJobFetching(externalId);
    const fetchingJobs = await repository.listJobs();
    const fetchingRow = fetchingJobs[0];
    expect(fetchingRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      status: "fetching"
    });
    expect(fetchingRow.updatedAt).not.toBe(discoveredRow.updatedAt);
    expect(await repository.getJobStatus(externalId)).toBe("fetching");

    await sleep(2);
    await repository.saveFetchedOffer(externalId, "# Offer");
    const fetchedJobs = await repository.listJobs();
    const fetchedRow = fetchedJobs[0];
    expect(fetchedRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: "# Offer",
      status: "fetched"
    });
    expect(await repository.getJobStatus(externalId)).toBe("fetched");

    await sleep(2);
    await repository.markJobScoring(externalId);
    const scoringJobs = await repository.listJobs();
    const scoringRow = scoringJobs[0];
    expect(scoringRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: "# Offer",
      status: "scoring"
    });
    expect(await repository.getJobStatus(externalId)).toBe("scoring");

    await sleep(2);
    await repository.markJobError(externalId);
    const errorJobs = await repository.listJobs();
    const errorRow = errorJobs[0];
    expect(errorRow).toMatchObject({
      externalId,
      title: "Senior Node Engineer",
      company: "Acme",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: "# Offer",
      status: "error"
    });
    expect(await repository.getJobStatus(externalId)).toBe("error");
  });

  test("persists scoring results for later local review", async () => {
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

    await repository.upsertDiscoveredJob(candidate.job);
    await repository.saveScoredJob(candidate);

    const matches = await repository.listMatchedJobs();

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      externalId: "justjoinit:/job-offer/acme",
      status: "matched",
      matchScore: 0.91,
      matchReason: "Strong overlap in Node.js, automation, and ETL.",
      summary: "Backend data platform role with strong Node.js fit."
    });
  });

  test("upserts fully hydrated jobs and preserves imported timestamps", async () => {
    await repository.upsertStoredJob({
      externalId: "justjoinit:/job-offer/acme",
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "",
      salaryText: "20 000 - 28 000 PLN/month",
      location: "Remote",
      offerMarkdown: undefined,
      matchScore: 0.91,
      matchReason: "Strong overlap in Node.js",
      summary: "Backend role with good fit",
      status: "matched",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-03T00:00:00.000Z"
    });

    const jobs = await repository.listJobs();
    expect(jobs).toEqual([
      expect.objectContaining({
        externalId: "justjoinit:/job-offer/acme",
        status: "matched",
        matchScore: 0.91,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-03T00:00:00.000Z"
      })
    ]);
  });

  test("updates applied and interested status properly", async () => {
    const externalId = "justjoinit:/job-offer/acme";

    await repository.upsertStoredJob({
      externalId,
      source: "justjoinit",
      url: "https://justjoin.it/job-offer/acme",
      title: "Senior Node Engineer",
      company: "Acme",
      status: "matched",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    });

    // default values
    let jobs = await repository.listJobs();
    let job = jobs[0];
    expect(job.isApplied).toBe(false);
    expect(job.isNotInterested).toBe(false);
    expect(job.appliedAt).toBeUndefined();

    // mark as applied
    await repository.updateJobAppliedStatus(externalId, true);
    jobs = await repository.listJobs();
    job = jobs[0];
    expect(job.isApplied).toBe(true);
    expect(job.appliedAt).toBeTypeOf("string");

    // mark as not interested
    await repository.updateJobInterestedStatus(externalId, true);
    jobs = await repository.listJobs();
    job = jobs[0];
    expect(job.isNotInterested).toBe(true);

    // mark as not applied
    await repository.updateJobAppliedStatus(externalId, false);
    jobs = await repository.listJobs();
    job = jobs[0];
    expect(job.isApplied).toBe(false);
    expect(job.appliedAt).toBeUndefined();
  });
});
