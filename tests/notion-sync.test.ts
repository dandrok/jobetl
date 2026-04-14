import { describe, expect, test, vi } from "vitest";

import { syncJobsToNotion } from "../src/notion/sync.js";
import type { StoredJob } from "../src/types.js";

const jobs: StoredJob[] = [
  {
    externalId: "justjoinit:/job-offer/acme",
    source: "justjoinit",
    url: "https://justjoin.it/job-offer/acme",
    title: "Senior Node Engineer",
    company: "Acme",
    status: "matched",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z"
  },
  {
    externalId: "justjoinit:/job-offer/beta",
    source: "justjoinit",
    url: "https://justjoin.it/job-offer/beta",
    title: "Staff Node Engineer",
    company: "Beta",
    status: "rejected",
    createdAt: "2024-01-03T00:00:00.000Z",
    updatedAt: "2024-01-04T00:00:00.000Z"
  }
];

function createRepository() {
  return {
    listJobs() {
      return jobs;
    }
  };
}

describe("syncJobsToNotion", () => {
  test("creates pages for jobs that do not exist in Notion", async () => {
    const createJob = vi.fn().mockResolvedValue(undefined);

    const summary = await syncJobsToNotion(createRepository(), {
      getSchema: async () => ({ statusKind: "status" }),
      findExistingJob: async () => undefined,
      createJob,
      updateJob: vi.fn()
    });

    expect(createJob).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      total: 2,
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0
    });
  });

  test("updates existing pages when the synced timestamp differs", async () => {
    const updateJob = vi.fn().mockResolvedValue(undefined);

    const summary = await syncJobsToNotion(createRepository(), {
      getSchema: async () => ({ statusKind: "status", updatedAtKind: "rich_text" }),
      findExistingJob: async (externalId: string) => ({
        pageId: `page-${externalId}`,
        syncedUpdatedAt: "2024-01-01T00:00:00.000Z"
      }),
      createJob: vi.fn(),
      updateJob
    });

    expect(updateJob).toHaveBeenCalledTimes(2);
    expect(summary.updated).toBe(2);
  });

  test("skips updates when Updated At already matches", async () => {
    const updateJob = vi.fn().mockResolvedValue(undefined);

    const summary = await syncJobsToNotion(createRepository(), {
      getSchema: async () => ({ statusKind: "status", updatedAtKind: "rich_text" }),
      findExistingJob: async (externalId: string) => ({
        pageId: `page-${externalId}`,
        syncedUpdatedAt:
          externalId === "justjoinit:/job-offer/acme"
            ? "2024-01-02T00:00:00.000Z"
            : "2024-01-01T00:00:00.000Z"
      }),
      createJob: vi.fn(),
      updateJob
    });

    expect(updateJob).toHaveBeenCalledTimes(1);
    expect(summary.skipped).toBe(1);
    expect(summary.updated).toBe(1);
  });

  test("continues syncing after individual job failures", async () => {
    const createJob = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const summary = await syncJobsToNotion(createRepository(), {
      getSchema: async () => ({ statusKind: "status" }),
      findExistingJob: async () => undefined,
      createJob,
      updateJob: vi.fn()
    });

    expect(summary.failed).toBe(1);
    expect(summary.errors[0]).toContain("justjoinit:/job-offer/acme");
    expect(summary.created).toBe(1);
  });

  test("emits progress snapshots as jobs are processed", async () => {
    const progress = {
      start: vi.fn(),
      update: vi.fn()
    };

    await syncJobsToNotion(
      createRepository(),
      {
        getSchema: async () => ({ statusKind: "status" }),
        findExistingJob: async () => undefined,
        createJob: vi.fn().mockResolvedValue(undefined),
        updateJob: vi.fn()
      },
      progress
    );

    expect(progress.start).toHaveBeenCalledWith({
      total: 2,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    });
    expect(progress.update).toHaveBeenNthCalledWith(1, {
      total: 2,
      processed: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0
    });
    expect(progress.update).toHaveBeenNthCalledWith(2, {
      total: 2,
      processed: 2,
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0
    });
  });
});
