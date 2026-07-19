import type { JobListing, MatchCandidate, StoredJob } from "@core/types";

export interface JobRepository {
  hasExternalId(externalId: string): Promise<boolean>;
  getJobStatus(externalId: string): Promise<StoredJob["status"] | undefined>;
  markJobFetching(externalId: string): Promise<void>;
  markJobScoring(externalId: string): Promise<void>;
  markJobError(externalId: string): Promise<void>;
  upsertDiscoveredJob(listing: JobListing): Promise<void>;
  saveFetchedOffer(externalId: string, offerMarkdown: string): Promise<void>;
  saveScoredJob(candidate: MatchCandidate, profileId?: string): Promise<void>;
  upsertStoredJob(job: StoredJob): Promise<void>;
  updateJobAppliedStatus(externalId: string, isApplied: boolean): Promise<boolean>;
  updateJobInterestedStatus(externalId: string, isNotInterested: boolean): Promise<boolean>;
  listJobs(): Promise<StoredJob[]>;
  listMatchedJobs(limit?: number): Promise<StoredJob[]>;
  close(): Promise<void>;
  getJob?(externalId: string): Promise<StoredJob | undefined>;
}

export * from "./postgres-job-repository";
export * from "./profile-merge";
export { jobsTable } from "./schema";
