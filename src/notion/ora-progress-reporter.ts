import ora, { type Ora } from "ora";

import { formatNotionSyncProgressText } from "@notion/formatters";
import type { NotionSyncProgressSnapshot } from "@notion/sync";

export class OraNotionSyncProgressReporter {
  private readonly spinner: Ora;

  constructor() {
    this.spinner = ora({
      isSilent: false
    });
  }

  start(snapshot: NotionSyncProgressSnapshot): void {
    this.spinner.start(formatNotionSyncProgressText(snapshot));
  }

  update(snapshot: NotionSyncProgressSnapshot): void {
    this.spinner.text = formatNotionSyncProgressText(snapshot);
  }

  succeed(summary: string): void {
    this.spinner.succeed(summary);
  }

  fail(message: string): void {
    this.spinner.fail(message);
  }
}
