import ora, { type Ora } from "ora";

import {
  formatPipelineProgressText,
  formatRunStartText
} from "./formatters.js";
import type { PipelineProgressSnapshot } from "../types.js";

export interface ProgressReporter {
  start(snapshot: PipelineProgressSnapshot): void;
  update(snapshot: PipelineProgressSnapshot): void;
  succeed(summary: string): void;
  fail(message: string): void;
}

export class OraProgressReporter implements ProgressReporter {
  private readonly spinner: Ora;

  constructor() {
    this.spinner = ora({
      isSilent: false
    });
  }

  start(snapshot: PipelineProgressSnapshot): void {
    this.spinner.start(
      `${formatRunStartText(snapshot.discovered)} | ${formatPipelineProgressText(snapshot)}`
    );
  }

  update(snapshot: PipelineProgressSnapshot): void {
    this.spinner.text = formatPipelineProgressText(snapshot);
  }

  succeed(summary: string): void {
    this.spinner.succeed(summary);
  }

  fail(message: string): void {
    this.spinner.fail(message);
  }
}
