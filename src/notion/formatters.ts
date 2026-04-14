import type { NotionSyncProgressSnapshot } from "./sync.js";

export function formatNotionSyncProgressText(
  snapshot: NotionSyncProgressSnapshot
): string {
  return [
    "syncing",
    `processed ${snapshot.processed}/${snapshot.total}`,
    `created ${snapshot.created}`,
    `updated ${snapshot.updated}`,
    `skipped ${snapshot.skipped}`,
    `failed ${snapshot.failed}`
  ].join(" | ");
}
