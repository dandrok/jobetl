import { describe, expect, test, vi } from "vitest";

import { formatNotionSyncProgressText } from "@notion/formatters";
import type { NotionSyncProgressSnapshot } from "@notion/sync";

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

  test("notion sync reporter uses snapshot-based start and update text", async () => {
    const writeMock = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const originalTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      const { NotionSyncProgressReporter } = await import("@notion/progress-reporter");
      const reporter = new NotionSyncProgressReporter();
      const startSnapshot = createSnapshot({
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0
      });

      reporter.start(startSnapshot);
      expect(writeMock).toHaveBeenCalled();

      const updateSnapshot = createSnapshot({
        processed: 5,
        updated: 3
      });
      writeMock.mockClear();
      reporter.update(updateSnapshot);
      expect(writeMock).toHaveBeenCalled();

      writeMock.mockClear();
      reporter.succeed("done");
      expect(writeMock).toHaveBeenCalled();

      // Restart progress to set lastTextLength > 0 for fail test
      reporter.start(startSnapshot);
      writeMock.mockClear();
      reporter.fail("failed");
      expect(writeMock).toHaveBeenCalled();
    } finally {
      process.stdout.isTTY = originalTTY;
      writeMock.mockRestore();
    }
  });
});
