import { afterEach, describe, expect, test, vi } from "vitest";

import { formatNotionSyncProgressText } from "../src/notion/formatters.js";
import type { NotionSyncProgressSnapshot } from "../src/notion/sync.js";

afterEach(() => {
  vi.doUnmock("ora");
  vi.resetModules();
});

function createSnapshot(
  overrides: Partial<NotionSyncProgressSnapshot> = {}
): NotionSyncProgressSnapshot {
  return {
    total: 10,
    processed: 4,
    created: 1,
    updated: 2,
    skipped: 1,
    failed: 0,
    ...overrides
  };
}

describe("notion sync progress", () => {
  test("formats the sync progress line", () => {
    expect(formatNotionSyncProgressText(createSnapshot())).toBe(
      "syncing | processed 4/10 | created 1 | updated 2 | skipped 1 | failed 0"
    );
  });

  test("ora notion sync reporter uses snapshot-based start and update text", async () => {
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

    const { OraNotionSyncProgressReporter } = await import(
      "../src/notion/ora-progress-reporter.js"
    );

    const reporter = new OraNotionSyncProgressReporter();
    const startSnapshot = createSnapshot({
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    });

    reporter.start(startSnapshot);

    expect(spinner.start).toHaveBeenCalledWith(
      formatNotionSyncProgressText(startSnapshot)
    );

    const updateSnapshot = createSnapshot({
      processed: 5,
      updated: 3
    });

    reporter.update(updateSnapshot);

    expect(spinner.text).toBe(formatNotionSyncProgressText(updateSnapshot));

    reporter.succeed("done");
    reporter.fail("failed");

    expect(spinner.succeed).toHaveBeenCalledWith("done");
    expect(spinner.fail).toHaveBeenCalledWith("failed");
  });
});
