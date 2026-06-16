import { BulldogjobAdapter } from "./bulldogjob.js";
import { JustJoinItAdapter } from "./justjoinit.js";
import { NoFluffJobsAdapter } from "./nofluffjobs.js";
import { PracujPlAdapter } from "./pracujpl.js";
import type { SourceAdapterMap } from "./types.js";

export function createSourceAdapters(): SourceAdapterMap {
  return {
    justjoinit: new JustJoinItAdapter(),
    nofluffjobs: new NoFluffJobsAdapter(),
    bulldogjob: new BulldogjobAdapter(),
    pracujpl: new PracujPlAdapter()
  };
}
