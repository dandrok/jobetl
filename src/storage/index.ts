import type { JobListing, MatchCandidate, StoredJob } from "@core/types";

export interface JobStatusFlags {
  isApplied?: boolean;
  isNotInterested?: boolean;
}

export interface JobRepository {
  hasExternalId(externalId: string): Promise<boolean>;
  getJobStatus(externalId: string): Promise<StoredJob["status"] | undefined>;
  getJob(externalId: string): Promise<StoredJob | undefined>;
  markJobFetching(externalId: string): Promise<void>;
  markJobScoring(externalId: string): Promise<void>;
  markJobError(externalId: string): Promise<void>;
  upsertDiscoveredJob(listing: JobListing): Promise<void>;
  saveFetchedOffer(externalId: string, offerMarkdown: string): Promise<void>;
  saveScoredJob(candidate: MatchCandidate, profileId?: string): Promise<void>;
  upsertStoredJob(job: StoredJob): Promise<void>;
  updateJobAppliedStatus(externalId: string, isApplied: boolean): Promise<boolean>;
  updateJobInterestedStatus(externalId: string, isNotInterested: boolean): Promise<boolean>;
  /** Applies both dashboard status flags in one statement so they cannot partially commit. */
  updateJobStatusFlags(externalId: string, flags: JobStatusFlags): Promise<boolean>;
  listJobs(): Promise<StoredJob[]>;
  listMatchedJobs(limit?: number): Promise<StoredJob[]>;
  close(): Promise<void>;
}

export * from "./postgres-job-repository";
export * from "./profile-merge";
export { jobsTable } from "./schema";
