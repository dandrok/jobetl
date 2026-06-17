import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JobListing, MatchCandidate, StoredJob } from "@core/types";

interface JobRow {
  external_id: string;
  source: string;
  url: string;
  title: string;
  company: string;
  salary_text: string | null;
  location: string | null;
  offer_markdown: string | null;
  match_score: number | null;
  match_reason: string | null;
  summary: string | null;
  status: string;
  is_applied: number;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: JobRow): StoredJob {
  return {
    externalId: row.external_id,
    source: row.source as StoredJob["source"],
    url: row.url,
    title: row.title,
    company: row.company,
    salaryText: row.salary_text ?? undefined,
    location: row.location ?? undefined,
    offerMarkdown: row.offer_markdown ?? undefined,
    matchScore: row.match_score ?? undefined,
    matchReason: row.match_reason ?? undefined,
    summary: row.summary ?? undefined,
    status: row.status as StoredJob["status"],
    isApplied: Boolean(row.is_applied),
    postedAt: row.posted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SQLiteJobRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
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
        updated_at TEXT NOT NULL
      );
    `);

    const tableInfo = this.database.prepare("PRAGMA table_info(jobs)").all() as Array<{
      name: string;
    }>;
    const hasIsApplied = tableInfo.some((col) => col.name === "is_applied");
    if (!hasIsApplied) {
      this.database.exec("ALTER TABLE jobs ADD COLUMN is_applied INTEGER NOT NULL DEFAULT 0;");
    }
    const hasPostedAt = tableInfo.some((col) => col.name === "posted_at");
    if (!hasPostedAt) {
      this.database.exec("ALTER TABLE jobs ADD COLUMN posted_at TEXT;");
    }
  }

  hasExternalId(externalId: string): boolean {
    const row = this.database
      .prepare("SELECT external_id FROM jobs WHERE external_id = ? LIMIT 1")
      .get(externalId) as { external_id: string } | undefined;

    return Boolean(row);
  }

  getJobStatus(externalId: string): StoredJob["status"] | undefined {
    const row = this.database
      .prepare("SELECT status FROM jobs WHERE external_id = ? LIMIT 1")
      .get(externalId) as { status: StoredJob["status"] } | undefined;

    return row?.status;
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
    this.database
      .prepare(
        `
        UPDATE jobs
        SET status = ?, updated_at = ?
        WHERE external_id = ?
      `
      )
      .run(status, now, externalId);
  }

  upsertDiscoveredJob(listing: JobListing): void {
    const now = new Date().toISOString();
    const discoveredAt = listing.discoveredAt || now;

    this.database
      .prepare(
        `
        INSERT INTO jobs (
          external_id, source, url, title, company, salary_text, location, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'discovered', ?, ?)
        ON CONFLICT(external_id) DO UPDATE SET
          source = excluded.source,
          url = excluded.url,
          title = excluded.title,
          company = excluded.company,
          salary_text = excluded.salary_text,
          location = excluded.location,
          updated_at = CASE
            WHEN
              jobs.source IS excluded.source AND
              jobs.url IS excluded.url AND
              jobs.title IS excluded.title AND
              jobs.company IS excluded.company AND
              jobs.salary_text IS excluded.salary_text AND
              jobs.location IS excluded.location
            THEN jobs.updated_at
            ELSE excluded.updated_at
          END
      `
      )
      .run(
        listing.externalId,
        listing.source,
        listing.url,
        listing.title,
        listing.company,
        listing.salaryText ?? null,
        listing.location ?? null,
        discoveredAt,
        now
      );
  }

  saveFetchedOffer(externalId: string, offerMarkdown: string): void {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `
        UPDATE jobs
        SET offer_markdown = ?, status = 'fetched', updated_at = ?
        WHERE external_id = ?
      `
      )
      .run(offerMarkdown, now, externalId);
  }

  saveScoredJob(candidate: MatchCandidate): void {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `
        UPDATE jobs
        SET
          offer_markdown = ?,
          match_score = ?,
          match_reason = ?,
          summary = ?,
          status = ?,
          updated_at = ?
        WHERE external_id = ?
      `
      )
      .run(
        candidate.job.offerMarkdown,
        candidate.match.score,
        candidate.match.reason,
        candidate.match.summary,
        candidate.match.shouldSave ? "matched" : "rejected",
        now,
        candidate.job.externalId
      );
  }

  upsertStoredJob(job: StoredJob): void {
    const hasIsApplied = typeof job.isApplied === "boolean";
    const hasPostedAt = typeof job.postedAt === "string";
    const sql = `
      INSERT INTO jobs (
        external_id, source, url, title, company, salary_text, location, offer_markdown, match_score, match_reason, summary, status, ${hasIsApplied ? "is_applied, " : ""}${hasPostedAt ? "posted_at, " : ""}created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${hasIsApplied ? "?, " : ""}${hasPostedAt ? "?, " : ""}?, ?)
      ON CONFLICT(external_id) DO UPDATE SET
        source = excluded.source,
        url = excluded.url,
        title = excluded.title,
        company = excluded.company,
        salary_text = excluded.salary_text,
        location = excluded.location,
        offer_markdown = excluded.offer_markdown,
        match_score = excluded.match_score,
        match_reason = excluded.match_reason,
        summary = excluded.summary,
        status = excluded.status,
        ${hasIsApplied ? "is_applied = excluded.is_applied," : ""}
        ${hasPostedAt ? "posted_at = excluded.posted_at," : ""}
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `;

    const params = [
      job.externalId,
      job.source,
      job.url,
      job.title,
      job.company,
      job.salaryText ?? null,
      job.location ?? null,
      job.offerMarkdown ?? null,
      job.matchScore ?? null,
      job.matchReason ?? null,
      job.summary ?? null,
      job.status
    ];

    if (hasIsApplied) {
      params.push(job.isApplied ? 1 : 0);
    }
    if (typeof job.postedAt === "string") {
      params.push(job.postedAt);
    }

    params.push(job.createdAt, job.updatedAt);
    this.database.prepare(sql).run(...params);
  }

  updateJobAppliedStatus(externalId: string, isApplied: boolean): boolean {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `
        UPDATE jobs
        SET is_applied = ?, updated_at = ?
        WHERE external_id = ?
      `
      )
      .run(isApplied ? 1 : 0, now, externalId);

    return result.changes > 0;
  }

  listJobs(): StoredJob[] {
    const rows = this.database
      .prepare("SELECT * FROM jobs ORDER BY updated_at DESC")
      .all() as unknown as JobRow[];

    return rows.map(mapRow);
  }

  listMatchedJobs(limit = 20): StoredJob[] {
    const rows = this.database
      .prepare(
        `
        SELECT * FROM jobs
        WHERE status = 'matched'
        ORDER BY match_score DESC, updated_at DESC
        LIMIT ?
      `
      )
      .all(limit) as unknown as JobRow[];

    return rows.map(mapRow);
  }
}
