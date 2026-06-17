import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, desc, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

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
    isApplied: Boolean(row.isApplied),
    postedAt: row.postedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class SQLiteJobRepository {
  private readonly db: BetterSQLite3Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const sqlite = new Database(databasePath);
    this.db = drizzle(sqlite);

    // Auto-create table since it's a local tool
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        external_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        salary_text TEXT,
        location TEXT,
        offer_markdown TEXT,
        match_score REAL,
        match_reason TEXT,
        summary TEXT,
        status TEXT NOT NULL,
        is_applied INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        posted_at TEXT
      );
    `);

    // Add columns if migrating from old schema without drizzle migrations
    const tableInfo = sqlite.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>;
    const hasIsApplied = tableInfo.some((col) => col.name === "is_applied");
    if (!hasIsApplied) {
      sqlite.exec("ALTER TABLE jobs ADD COLUMN is_applied INTEGER NOT NULL DEFAULT 0;");
    }
    const hasPostedAt = tableInfo.some((col) => col.name === "posted_at");
    if (!hasPostedAt) {
      sqlite.exec("ALTER TABLE jobs ADD COLUMN posted_at TEXT;");
    }
  }

  hasExternalId(externalId: string): boolean {
    const row = this.db
      .select({ externalId: jobsTable.externalId })
      .from(jobsTable)
      .where(eq(jobsTable.externalId, externalId))
      .limit(1)
      .get();
    return Boolean(row);
  }

  getJobStatus(externalId: string): StoredJob["status"] | undefined {
    const row = this.db
      .select({ status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.externalId, externalId))
      .limit(1)
      .get();
    return row?.status as StoredJob["status"] | undefined;
  }

  markJobFetching(externalId: string): void {
    this.updateJobStatus(externalId, "fetching");
  }

  markJobScoring(externalId: string): void {
    this.updateJobStatus(externalId, "scoring");
  }

  markJobError(externalId: string): void {
    this.updateJobStatus(externalId, "error");
  }

  private updateJobStatus(externalId: string, status: StoredJob["status"]): void {
    const now = new Date().toISOString();
    this.db
      .update(jobsTable)
      .set({ status, updatedAt: now })
      .where(eq(jobsTable.externalId, externalId))
      .run();
  }

  upsertDiscoveredJob(listing: JobListing): void {
    const now = new Date().toISOString();
    const discoveredAt = listing.discoveredAt || now;

    this.db
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
              WHEN jobs.source IS ${listing.source} AND
                   jobs.url IS ${listing.url} AND
                   jobs.title IS ${listing.title} AND
                   jobs.company IS ${listing.company} AND
                   jobs.salary_text IS ${listing.salaryText ?? null} AND
                   jobs.location IS ${listing.location ?? null}
              THEN jobs.updated_at
              ELSE ${now}
            END
          `
        }
      })
      .run();
  }

  saveFetchedOffer(externalId: string, offerMarkdown: string): void {
    const now = new Date().toISOString();
    this.db
      .update(jobsTable)
      .set({ offerMarkdown, status: "fetched", updatedAt: now })
      .where(eq(jobsTable.externalId, externalId))
      .run();
  }

  saveScoredJob(candidate: MatchCandidate): void {
    const now = new Date().toISOString();
    this.db
      .update(jobsTable)
      .set({
        offerMarkdown: candidate.job.offerMarkdown,
        matchScore: candidate.match.score,
        matchReason: candidate.match.reason,
        summary: candidate.match.summary,
        status: candidate.match.shouldSave ? "matched" : "rejected",
        updatedAt: now
      })
      .where(eq(jobsTable.externalId, candidate.job.externalId))
      .run();
  }

  upsertStoredJob(job: StoredJob): void {
    const setClause: any = {
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
      setClause.isApplied = job.isApplied ? 1 : 0;
    }
    if (typeof job.postedAt === "string") {
      setClause.postedAt = job.postedAt;
    }

    const values = {
      externalId: job.externalId,
      ...setClause,
      isApplied: setClause.isApplied ?? 0,
      postedAt: setClause.postedAt ?? null
    };

    this.db
      .insert(jobsTable)
      .values(values)
      .onConflictDoUpdate({
        target: jobsTable.externalId,
        set: setClause
      })
      .run();
  }

  updateJobAppliedStatus(externalId: string, isApplied: boolean): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .update(jobsTable)
      .set({ isApplied: isApplied ? 1 : 0, updatedAt: now })
      .where(eq(jobsTable.externalId, externalId))
      .run();
    return result.changes > 0;
  }

  listJobs(): StoredJob[] {
    const rows = this.db.select().from(jobsTable).orderBy(desc(jobsTable.updatedAt)).all();
    return rows.map(mapRow);
  }

  listMatchedJobs(limit = 20): StoredJob[] {
    const rows = this.db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.status, "matched"))
      .orderBy(desc(jobsTable.matchScore), desc(jobsTable.updatedAt))
      .limit(limit)
      .all();
    return rows.map(mapRow);
  }
}
