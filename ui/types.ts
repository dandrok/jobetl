export interface StoredJob {
  externalId: string;
  source: string;
  title: string;
  company: string;
  url: string;
  location?: string;
  salary?: string;
  status: "matched" | "rejected";
  matchScore?: number;
  matchReason?: string;
  createdAt: string;
  isApplied: boolean;
  isNotInterested: boolean;
  appliedAt?: string;
}
