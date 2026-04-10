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
  notionDatabaseId: string;
  resumeMarkdownPath: string;
  matchThreshold: number;
  dryRun: boolean;
  sources: {
    justjoinit: SourceConfig;
  };
}

export interface RuntimeEnv {
  jinaApiKey: string;
  notionApiKey: string;
  deepseekApiKey: string;
}
