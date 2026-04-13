import { afterEach, describe, expect, test, vi } from "vitest";

import {
  derivePipelineStage,
  formatPipelineProgressText,
  formatRunStartText
} from "../src/progress/formatters.js";
import type { PipelineProgressSnapshot } from "../src/types.js";

afterEach(() => {
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
    expect(
      derivePipelineStage(createSnapshot())
    ).toBe("mixed");
  });

  test("formats the pipeline progress line", () => {
    expect(
      formatPipelineProgressText(createSnapshot())
    ).toBe(
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

  test("ora progress reporter uses snapshot-based start and update text", async () => {
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
      text: ""
    };
    const ora = vi.fn(() => spinner);

    vi.doMock("ora", () => ({
      default: ora
    }));

    const { OraProgressReporter } = await import(
      "../src/progress/ora-progress-reporter.js"
    );

    const reporter = new OraProgressReporter();
    const startSnapshot = createSnapshot({
      stage: "discovering",
      fetching: 0,
      scoring: 0,
      activeFetchCompanies: [],
      activeScoreCompanies: []
    });
    reporter.start(startSnapshot);

    expect(spinner.start).toHaveBeenCalledWith(
      `${formatRunStartText(startSnapshot.discovered)} | ${formatPipelineProgressText(startSnapshot)}`
    );

    const updateSnapshot = createSnapshot({
      stage: "fetching",
      queuedFetch: 1,
      fetching: 1,
      queuedScore: 0,
      scoring: 0,
      activeFetchCompanies: ["Gamma"],
      activeScoreCompanies: []
    });
    reporter.update(updateSnapshot);

    expect(spinner.text).toBe(formatPipelineProgressText(updateSnapshot));

    reporter.succeed("done");
    reporter.fail("failed");

    expect(spinner.succeed).toHaveBeenCalledWith("done");
    expect(spinner.fail).toHaveBeenCalledWith("failed");
  });
});
