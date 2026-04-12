export type JobSource = "justjoinit";

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
  | "fetched"
  | "scored"
  | "matched"
  | "rejected"
  | "error";

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

export interface SearchFilters {
  keyword?: string;
  categorySlug?: string;
  location?: string;
  workingMode?: "remote" | "hybrid" | "office";
  experienceLevel?: "junior" | "mid" | "senior" | "manager";
  minSalary?: number;
  salaryCurrency?: string;
  withSalaryOnly?: boolean;
}

export interface SourceConfig {
  enabled: boolean;
  baseUrl: string;
  filters: SearchFilters;
  maxListings: number;
}

export interface RunConfig {
  databasePath: string;
  resumeMarkdownPath: string;
  matchThreshold: number;
  sources: {
    justjoinit: SourceConfig;
  };
}

export interface RuntimeEnv {
  jinaApiKey: string;
  deepseekApiKey: string;
}
