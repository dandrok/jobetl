export const JOB_SOURCES = ["justjoinit", "nofluffjobs", "bulldogjob"] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

export interface JobListing {
  externalId: string;
  source: JobSource;
  url: string;
  title: string;
  company: string;
  salaryText?: string;
  location?: string;
}

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

export type PipelineStage =
  | "discovering"
  | "fetching"
  | "scoring"
  | "mixed"
  | "done";

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
