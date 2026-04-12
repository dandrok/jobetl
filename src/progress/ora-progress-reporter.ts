import ora, { type Ora } from "ora";

import {
  formatOfferProgressText,
  formatRunStartText
} from "./formatters.js";

export interface ProgressReporter {
  start(totalListings: number): void;
  update(current: number, total: number, step: string, company: string): void;
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

  start(totalListings: number): void {
    this.spinner.start(formatRunStartText(totalListings));
  }

  update(current: number, total: number, step: string, company: string): void {
    this.spinner.text = formatOfferProgressText(current, total, step, company);
  }

  succeed(summary: string): void {
    this.spinner.succeed(summary);
  }

  fail(message: string): void {
    this.spinner.fail(message);
  }
}
