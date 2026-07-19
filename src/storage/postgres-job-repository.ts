import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { jobsTable } from "./schema";
import type { JobRepository } from "./index";
import type { JobListing, MatchCandidate, StoredJob } from "@core/types";
import { mergeScoredJobState } from "@storage/profile-merge";

function mapRow(row: typeof jobsTable.$inferSelect): StoredJob {
  return {
    externalId: row.externalId,
    source: row.source as StoredJob["source"],
    url: row.url,
    title: row.title,
    company: row.company,
    salaryText: row.salaryText ?? undefined,
    location: row.location ?? undefined,
    offerMarkdown: row.offerMarkdown ?? undefined,
    matchScore: row.matchScore ?? undefined,
    matchReason: row.matchReason ?? undefined,
    summary: row.summary ?? undefined,
    profile: row.profile ?? null,
    status: row.status as StoredJob["status"],
    isApplied: row.isApplied,
    isNotInterested: row.isNotInterested,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : undefined,
    appliedAt: row.appliedAt ? new Date(row.appliedAt).toISOString() : undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export class PostgresJobRepository implements JobRepository {
  private readonly client: postgres.Sql;
  private readonly db: PostgresJsDatabase;

  constructor(connectionString: string) {
    this.client = postgres(connectionString);
    this.db = drizzle(this.client);
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  async hasExternalId(externalId: string): Promise<boolean> {
    const rows = await this.db
      .select({ externalId: jobsTable.externalId })
      .from(jobsTable)
      .where(eq(jobsTable.externalId, externalId))
      .limit(1);
    return rows.length > 0;
  }

  async getJobStatus(externalId: string): Promise<StoredJob["status"] | undefined> {
    const rows = await this.db
      .select({ status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.externalId, externalId))
      .limit(1);
    return rows[0]?.status as StoredJob["status"] | undefined;
  }

  async getJob(externalId: string): Promise<StoredJob | undefined> {
    const rows = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.externalId, externalId))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : undefined;
  }

  async markJobFetching(externalId: string): Promise<void> {
    await this.updateJobStatus(externalId, "fetching");
  }

  async markJobScoring(externalId: string): Promise<void> {
    await this.updateJobStatus(externalId, "scoring");
  }

  async markJobError(externalId: string): Promise<void> {
    await this.updateJobStatus(externalId, "error");
  }

  private async updateJobStatus(externalId: string, status: StoredJob["status"]): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(jobsTable)
      .set({ status, updatedAt: now })
      .where(eq(jobsTable.externalId, externalId));
  }

  async upsertDiscoveredJob(listing: JobListing): Promise<void> {
    const now = new Date().toISOString();
    const discoveredAt = listing.discoveredAt || now;

    await this.db
      .insert(jobsTable)
      .values({
        externalId: listing.externalId,
        source: listing.source,
        url: listing.url,
        title: listing.title,
        company: listing.company,
        salaryText: listing.salaryText ?? null,
        location: listing.location ?? null,
        status: "discovered",
        createdAt: discoveredAt,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: jobsTable.externalId,
        set: {
          source: listing.source,
          url: listing.url,
          title: listing.title,
          company: listing.company,
          salaryText: listing.salaryText ?? null,
          location: listing.location ?? null,
          updatedAt: sql`
            CASE
              WHEN jobs.source IS NOT DISTINCT FROM ${listing.source} AND
                   jobs.url IS NOT DISTINCT FROM ${listing.url} AND
                   jobs.title IS NOT DISTINCT FROM ${listing.title} AND
                   jobs.company IS NOT DISTINCT FROM ${listing.company} AND
                   jobs.salary_text IS NOT DISTINCT FROM ${listing.salaryText ?? null} AND
                   jobs.location IS NOT DISTINCT FROM ${listing.location ?? null}
              THEN jobs.updated_at
              ELSE ${now}
            END
          `
        }
      });
  }

  async saveFetchedOffer(externalId: string, offerMarkdown: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(jobsTable)
      .set({ offerMarkdown, status: "fetched", updatedAt: now })
      .where(eq(jobsTable.externalId, externalId));
  }

  async saveScoredJob(candidate: MatchCandidate, profileId?: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getJob(candidate.job.externalId);
    const merged = profileId
      ? mergeScoredJobState(existing, candidate, profileId)
      : {
          profile: existing?.profile ?? null,
          status: (candidate.match.shouldSave ? "matched" : "rejected") as "matched" | "rejected",
          matchScore: candidate.match.score,
          matchReason: candidate.match.reason,
          summary: candidate.match.summary
        };

    await this.db
      .update(jobsTable)
      .set({
        offerMarkdown: candidate.job.offerMarkdown,
        matchScore: merged.matchScore,
        matchReason: merged.matchReason,
        summary: merged.summary,
        profile: merged.profile,
        status: merged.status,
        updatedAt: now
      })
      .where(eq(jobsTable.externalId, candidate.job.externalId));
  }

  async upsertStoredJob(job: StoredJob): Promise<void> {
    const setClause: Partial<typeof jobsTable.$inferInsert> = {
      source: job.source,
      url: job.url,
      title: job.title,
      company: job.company,
      salaryText: job.salaryText ?? null,
      location: job.location ?? null,
      offerMarkdown: job.offerMarkdown ?? null,
      matchScore: job.matchScore ?? null,
      matchReason: job.matchReason ?? null,
      summary: job.summary ?? null,
      profile: job.profile ?? null,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };

    if (typeof job.isApplied === "boolean") {
      setClause.isApplied = job.isApplied;
    }
    if (typeof job.isNotInterested === "boolean") {
      setClause.isNotInterested = job.isNotInterested;
    }
    if (typeof job.postedAt === "string" || job.postedAt === null) {
      setClause.postedAt = job.postedAt;
    }
    if (typeof job.appliedAt === "string" || job.appliedAt === null) {
      setClause.appliedAt = job.appliedAt;
    }

    const values = {
      externalId: job.externalId,
      ...setClause,
      isApplied: setClause.isApplied ?? false,
      isNotInterested: setClause.isNotInterested ?? false,
      postedAt: setClause.postedAt ?? null,
      appliedAt: setClause.appliedAt ?? null
    };

    await this.db.insert(jobsTable).values(values).onConflictDoUpdate({
      target: jobsTable.externalId,
      set: setClause
    });
  }

  async updateJobAppliedStatus(externalId: string, isApplied: boolean): Promise<boolean> {
    const now = new Date().toISOString();
    const appliedAt = isApplied ? now : null;
    const result = await this.db
      .update(jobsTable)
      .set({ isApplied, appliedAt, updatedAt: now })
      .where(eq(jobsTable.externalId, externalId))
      .returning({ externalId: jobsTable.externalId });
    return result.length > 0;
  }

  async updateJobInterestedStatus(externalId: string, isNotInterested: boolean): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db
      .update(jobsTable)
      .set({ isNotInterested, updatedAt: now })
      .where(eq(jobsTable.externalId, externalId))
      .returning({ externalId: jobsTable.externalId });
    return result.length > 0;
  }

  async listJobs(): Promise<StoredJob[]> {
    const rows = await this.db.select().from(jobsTable).orderBy(desc(jobsTable.updatedAt));
    return rows.map(mapRow);
  }

  async listMatchedJobs(limit = 20): Promise<StoredJob[]> {
    const rows = await this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.status, "matched"))
      .orderBy(desc(jobsTable.matchScore), desc(jobsTable.updatedAt))
      .limit(limit);
    return rows.map(mapRow);
  }
}
