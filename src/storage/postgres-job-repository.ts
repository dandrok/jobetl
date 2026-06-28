import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { jobsTable } from "./schema";
import type { JobListing, MatchCandidate, StoredJob } from "@core/types";

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
    status: row.status as StoredJob["status"],
    isApplied: row.isApplied,
    isNotInterested: row.isNotInterested,
    postedAt: row.postedAt ?? undefined,
    appliedAt: row.appliedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function createPostgresJobRepository(connectionString: string) {
  const client = postgres(connectionString);
  const db = drizzle(client);

  async function updateJobStatus(externalId: string, status: StoredJob["status"]): Promise<void> {
    const now = new Date().toISOString();
    await db
      .update(jobsTable)
      .set({ status, updatedAt: now })
      .where(eq(jobsTable.externalId, externalId));
  }

  return {
    async hasExternalId(externalId: string): Promise<boolean> {
      const rows = await db
        .select({ externalId: jobsTable.externalId })
        .from(jobsTable)
        .where(eq(jobsTable.externalId, externalId))
        .limit(1);
      return rows.length > 0;
    },

    async getJobStatus(externalId: string): Promise<StoredJob["status"] | undefined> {
      const rows = await db
        .select({ status: jobsTable.status })
        .from(jobsTable)
        .where(eq(jobsTable.externalId, externalId))
        .limit(1);
      return rows[0]?.status as StoredJob["status"] | undefined;
    },

    async markJobFetching(externalId: string): Promise<void> {
      await updateJobStatus(externalId, "fetching");
    },

    async markJobScoring(externalId: string): Promise<void> {
      await updateJobStatus(externalId, "scoring");
    },

    async markJobError(externalId: string): Promise<void> {
      await updateJobStatus(externalId, "error");
    },

    async upsertDiscoveredJob(listing: JobListing): Promise<void> {
      const now = new Date().toISOString();
      const discoveredAt = listing.discoveredAt || now;

      await db
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
                WHEN jobs.source = ${listing.source} AND
                     jobs.url = ${listing.url} AND
                     jobs.title = ${listing.title} AND
                     jobs.company = ${listing.company} AND
                     (jobs.salary_text = ${listing.salaryText ?? null} OR (jobs.salary_text IS NULL AND ${listing.salaryText ?? null} IS NULL)) AND
                     (jobs.location = ${listing.location ?? null} OR (jobs.location IS NULL AND ${listing.location ?? null} IS NULL))
                THEN jobs.updated_at
                ELSE ${now}
                END
            `
          }
        });
    },

    async saveFetchedOffer(externalId: string, offerMarkdown: string): Promise<void> {
      const now = new Date().toISOString();
      await db
        .update(jobsTable)
        .set({ offerMarkdown, status: "fetched", updatedAt: now })
        .where(eq(jobsTable.externalId, externalId));
    },

    async saveScoredJob(candidate: MatchCandidate): Promise<void> {
      const now = new Date().toISOString();
      await db
        .update(jobsTable)
        .set({
          offerMarkdown: candidate.job.offerMarkdown,
          matchScore: candidate.match.score,
          matchReason: candidate.match.reason,
          summary: candidate.match.summary,
          status: candidate.match.shouldSave ? "matched" : "rejected",
          updatedAt: now
        })
        .where(eq(jobsTable.externalId, candidate.job.externalId));
    },

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

      await db
        .insert(jobsTable)
        .values(values)
        .onConflictDoUpdate({
          target: jobsTable.externalId,
          set: setClause
        });
    },

    async updateJobAppliedStatus(externalId: string, isApplied: boolean): Promise<boolean> {
      const now = new Date().toISOString();
      const appliedAt = isApplied ? now : null;
      const result = await db
        .update(jobsTable)
        .set({ isApplied, appliedAt, updatedAt: now })
        .where(eq(jobsTable.externalId, externalId))
        .returning({ externalId: jobsTable.externalId });
      return result.length > 0;
    },

    async updateJobInterestedStatus(externalId: string, isNotInterested: boolean): Promise<boolean> {
      const now = new Date().toISOString();
      const result = await db
        .update(jobsTable)
        .set({ isNotInterested, updatedAt: now })
        .where(eq(jobsTable.externalId, externalId))
        .returning({ externalId: jobsTable.externalId });
      return result.length > 0;
    },

    async listJobs(): Promise<StoredJob[]> {
      const rows = await db.select().from(jobsTable).orderBy(desc(jobsTable.updatedAt));
      return rows.map(mapRow);
    },

    async listMatchedJobs(limit = 20): Promise<StoredJob[]> {
      const rows = await db
        .select()
        .from(jobsTable)
        .where(eq(jobsTable.status, "matched"))
        .orderBy(desc(jobsTable.matchScore), desc(jobsTable.updatedAt))
        .limit(limit);
      return rows.map(mapRow);
    }
  };
}

export type PostgresJobRepository = ReturnType<typeof createPostgresJobRepository>;
