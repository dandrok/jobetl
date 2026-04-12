import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JobListing, MatchCandidate, StoredJob } from "../types.js";

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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  hasExternalId(externalId: string): boolean {
    const row = this.database
      .prepare("SELECT external_id FROM jobs WHERE external_id = ? LIMIT 1")
      .get(externalId) as { external_id: string } | undefined;

    return Boolean(row);
  }

  upsertDiscoveredJob(job: JobListing): void {
    const now = new Date().toISOString();
    this.database
      .prepare(`
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
          updated_at = excluded.updated_at
      `)
      .run(
        job.externalId,
        job.source,
        job.url,
        job.title,
        job.company,
        job.salaryText ?? null,
        job.location ?? null,
        now,
        now
      );
  }

  saveFetchedOffer(externalId: string, offerMarkdown: string): void {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE jobs
        SET offer_markdown = ?, status = 'fetched', updated_at = ?
        WHERE external_id = ?
      `)
      .run(offerMarkdown, now, externalId);
  }

  saveScoredJob(candidate: MatchCandidate): void {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE jobs
        SET
          offer_markdown = ?,
          match_score = ?,
          match_reason = ?,
          summary = ?,
          status = ?,
          updated_at = ?
        WHERE external_id = ?
      `)
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

  listJobs(): StoredJob[] {
    const rows = this.database
      .prepare("SELECT * FROM jobs ORDER BY updated_at DESC")
      .all() as unknown as JobRow[];

    return rows.map(mapRow);
  }

  listMatchedJobs(limit = 20): StoredJob[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM jobs
        WHERE status = 'matched'
        ORDER BY match_score DESC, updated_at DESC
        LIMIT ?
      `)
      .all(limit) as unknown as JobRow[];

    return rows.map(mapRow);
  }
}
