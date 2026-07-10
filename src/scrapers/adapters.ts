import { BulldogjobAdapter } from "./bulldogjob";
import { JustJoinItAdapter } from "./justjoinit";
import { NoFluffJobsAdapter } from "./nofluffjobs";
import { PracujPlAdapter } from "./pracujpl";
import { TheSmartJobsAdapter } from "./thesmartjobs";
import type { SourceAdapterMap } from "./types";

export function createSourceAdapters(): SourceAdapterMap {
  return {
    justjoinit: new JustJoinItAdapter(),
    nofluffjobs: new NoFluffJobsAdapter(),
    bulldogjob: new BulldogjobAdapter(),
    pracujpl: new PracujPlAdapter(),
    thesmartjobs: new TheSmartJobsAdapter()
  };
}
