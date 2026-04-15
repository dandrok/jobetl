import type { JobListing, JobSource, SourceConfigFor } from "../types.js";

export interface SourceAdapter<T extends JobSource = JobSource> {
  readonly source: T;
  discoverListings(
    config: SourceConfigFor<T>,
    fetchHtml: (url: string) => Promise<string>
  ): Promise<JobListing[]>;
}

export type SourceAdapterMap = {
  [K in JobSource]: SourceAdapter<K>;
};

export interface SelectedSource<T extends JobSource = JobSource> {
  source: T;
  adapter: SourceAdapter<T>;
  config: SourceConfigFor<T>;
}
