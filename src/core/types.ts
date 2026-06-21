import { z } from "zod";

export const JOB_SOURCES = ["justjoinit", "nofluffjobs", "bulldogjob", "pracujpl"] as const;

export const JobSourceSchema = z.enum(JOB_SOURCES);
export type JobSource = z.infer<typeof JobSourceSchema>;

export const JobListingSchema = z.object({
  externalId: z.string().min(1, "externalId cannot be empty"),
  source: JobSourceSchema,
  url: z.string().url("Must be a valid URL"),
  title: z.string().min(2, "title is too short"),
  company: z.string().min(1, "company cannot be empty"),
  salaryText: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  discoveredAt: z.string().datetime().optional()
});

export type JobListing = z.infer<typeof JobListingSchema>;

export interface JobOffer extends JobListing {
  offerMarkdown: string;
}

export interface MatchResult {
  score: number;
  reason: string;
  summary: string;
  shouldSave: boolean;
}

export interface MatchCandidate {
  job: JobOffer;
  match: MatchResult;
}

export type JobStatus =
  | "discovered"
  | "fetching"
  | "fetched"
  | "scoring"
  | "scored"
  | "matched"
  | "rejected"
  | "error";

export type PipelineStage = "discovering" | "fetching" | "scoring" | "mixed" | "done";

export interface PipelineProgressSnapshot {
  stage: PipelineStage;
  discovered: number;
  skipped: number;
  queuedFetch: number;
  fetching: number;
  queuedScore: number;
  scoring: number;
  matched: number;
  rejected: number;
  failed: number;
  activeFetchCompanies: string[];
  activeScoreCompanies: string[];
}

export interface StoredJob {
  externalId: string;
  source: JobSource;
  url: string;
  title: string;
  company: string;
  salaryText?: string;
  location?: string;
  offerMarkdown?: string;
  matchScore?: number;
  matchReason?: string;
  summary?: string;
  status: JobStatus;
  isApplied?: boolean;
  isNotInterested?: boolean;
  postedAt?: string | null;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JustJoinItSearchFilters {
  keyword?: string;
  categorySlug?: string;
  location?: string;
  workingMode?: "remote" | "hybrid" | "office";
  experienceLevel?: "junior" | "mid" | "senior" | "manager";
  minSalary?: number;
  salaryCurrency?: string;
  withSalaryOnly?: boolean;
}

export interface NoFluffJobsSearchFilters {
  keyword?: string;
  location?: string;
}

export interface BulldogjobSearchFilters {
  keyword?: string;
}

export interface PracujPlSearchFilters {
  keyword?: string;
  location?: string;
}

export type SearchFilters = JustJoinItSearchFilters;

export interface SourceConfig<TFilters = SearchFilters> {
  enabled: boolean;
  baseUrl: string;
  filters: TFilters;
  maxListings: number;
}

export interface SourceConfigMap {
  justjoinit: SourceConfig<JustJoinItSearchFilters>;
  nofluffjobs: SourceConfig<NoFluffJobsSearchFilters>;
  bulldogjob: SourceConfig<BulldogjobSearchFilters>;
  pracujpl: SourceConfig<PracujPlSearchFilters>;
}

export type SourceConfigFor<T extends JobSource> = SourceConfigMap[T];

export interface RunConfig {
  databasePath: string;
  resumeMarkdownPath: string;
  matchThreshold: number;
  fetchConcurrency: number;
  scoreConcurrency: number;
  sources: SourceConfigMap;
}

export interface RuntimeEnv {
  jinaApiKey: string;
  deepseekApiKey: string;
}

export interface NotionSyncEnv {
  notionToken: string;
  notionDatabaseId: string;
}
