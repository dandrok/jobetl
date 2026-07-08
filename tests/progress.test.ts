import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  derivePipelineStage,
  formatPipelineProgressText,
  formatRunStartText
} from "@progress/formatters";
import type { PipelineProgressSnapshot } from "@core/types";

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  vi.doUnmock("ora");
  vi.resetModules();
});

function createSnapshot(
  overrides: Partial<PipelineProgressSnapshot> = {}
): PipelineProgressSnapshot {
  return {
    stage: "discovering",
    discovered: 42,
    skipped: 30,
    queuedFetch: 8,
    fetching: 4,
    queuedScore: 3,
    scoring: 2,
    matched: 5,
    rejected: 2,
    failed: 1,
    activeFetchCompanies: ["Acme"],
    activeScoreCompanies: ["BetaSoft"],
    ...overrides
  };
}

describe("progress formatters", () => {
  test("formats the run start text with listing counts", () => {
    expect(formatRunStartText(25)).toBe("Found 25 listings to process");
  });

  test("derives mixed stage when both worker types are active", () => {
    expect(derivePipelineStage(createSnapshot())).toBe("mixed");
  });

  test("formats the pipeline progress line", () => {
    expect(formatPipelineProgressText(createSnapshot())).toBe(
      "stage: mixed | discovered 42 | skipped 30 | queued-fetch 8 | fetching 4 | queued-score 3 | scoring 2 | matched 5 | rejected 2 | failed 1 | current: fetching Acme, scoring BetaSoft"
    );
  });

  test("derives fetching stage when fetch work is queued but no worker is active", () => {
    expect(
      derivePipelineStage(
        createSnapshot({
          stage: "discovering",
          queuedFetch: 2,
          fetching: 0,
          queuedScore: 0,
          scoring: 0,
          activeFetchCompanies: [],
          activeScoreCompanies: []
        })
      )
    ).toBe("fetching");
  });

  test("derives scoring stage when only score work remains queued during handoff", () => {
    const snapshot = createSnapshot({
      stage: "fetching",
      queuedFetch: 0,
      fetching: 0,
      queuedScore: 1,
      scoring: 0,
      activeFetchCompanies: [],
      activeScoreCompanies: []
    });

    expect(derivePipelineStage(snapshot)).toBe("scoring");
    expect(formatPipelineProgressText(snapshot)).toBe(
      "stage: scoring | discovered 42 | skipped 30 | queued-fetch 0 | fetching 0 | queued-score 1 | scoring 0 | matched 5 | rejected 2 | failed 1"
    );
  });

  test("keeps the done stage when no workers are active", () => {
    expect(
      formatPipelineProgressText(
        createSnapshot({
          stage: "done",
          discovered: 10,
          skipped: 1,
          queuedFetch: 0,
          fetching: 0,
          queuedScore: 0,
          scoring: 0,
          matched: 7,
          rejected: 2,
          failed: 1,
          activeFetchCompanies: [],
          activeScoreCompanies: []
        })
      )
    ).toBe(
      "stage: done | discovered 10 | skipped 1 | queued-fetch 0 | fetching 0 | queued-score 0 | scoring 0 | matched 7 | rejected 2 | failed 1"
    );
  });

  test("single line progress reporter uses snapshot-based start and update text", async () => {
    const writeMock = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const originalTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      const { SingleLineProgressReporter } =
        await import("@progress/single-line-progress-reporter");

      const reporter = new SingleLineProgressReporter();
      const startSnapshot = createSnapshot({
        stage: "discovering",
        fetching: 0,
        scoring: 0,
        activeFetchCompanies: [],
        activeScoreCompanies: []
      });
      reporter.start(startSnapshot);

      expect(writeMock).toHaveBeenCalled();

      const updateSnapshot = createSnapshot({
        stage: "fetching",
        queuedFetch: 1,
        fetching: 1,
        queuedScore: 0,
        scoring: 0,
        activeFetchCompanies: ["Gamma"],
        activeScoreCompanies: []
      });
      writeMock.mockClear();
      reporter.update(updateSnapshot);

      expect(writeMock).toHaveBeenCalled();

      writeMock.mockClear();
      reporter.succeed("done");
      expect(writeMock).toHaveBeenCalled();

      // Restart progress to ensure lastTextLength > 0 for fail test
      reporter.start(startSnapshot);
      writeMock.mockClear();
      reporter.fail("failed");
      expect(writeMock).toHaveBeenCalled();
    } finally {
      process.stdout.isTTY = originalTTY;
      writeMock.mockRestore();
    }
  });

  test("multiline progress reporter updates and clears stdout", async () => {
    const writeMock = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const originalTTY = process.stdout.isTTY;
    const originalColumns = process.stdout.columns;
    process.stdout.isTTY = true;
    process.stdout.columns = 100;

    try {
      const { MultilineProgressReporter } = await import("@progress/multiline-progress-reporter");
      const reporter = new MultilineProgressReporter();
      const snapshot = createSnapshot();

      reporter.start(snapshot);
      expect(writeMock).toHaveBeenCalled();

      writeMock.mockClear();
      reporter.update(snapshot);
      expect(writeMock).toHaveBeenCalled();

      writeMock.mockClear();
      reporter.succeed("success");
      expect(writeMock).toHaveBeenCalled();

      writeMock.mockClear();
      reporter.start(snapshot);
      writeMock.mockClear();
      reporter.fail("fail");
      expect(writeMock).toHaveBeenCalled();
    } finally {
      process.stdout.isTTY = originalTTY;
      process.stdout.columns = originalColumns;
      writeMock.mockRestore();
    }
  });
});
