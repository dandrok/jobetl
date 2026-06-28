import { StoredJob } from "@core/types";
import { eq } from "drizzle-orm";
import { pgTable, text, real, boolean, PgGeometry } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/singlestore";
import postgres from 'postgrese'

// TODO: make it postgresql friendly 
export const jobsTable = pgTable("jobs", {
  externalId: text("external_id").primaryKey(),
  source: text("source").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  salaryText: text("salary_text"),
  location: text("location"),
  offerMarkdown: text("offer_markdown"),
  matchScore: real("match_score"),
  matchReason: text("match_reason"),
  summary: text("summary"),
  status: text("status").notNull(),
  isApplied: boolean("is_applied").notNull().default(false),
  isNotInterested: boolean("is_not_interested").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  postedAt: text("posted_at"),
  appliedAt: text("applied_at")
});

export function createPostgresJobRepository(connectingString: string) {
  const client = postgres(connectingString)
  const db = drizzle(client)

  async function updateJobStatus(externalId: string, status: StoredJob['status']): Promise<void> {
    const now = new Date().toISOString();
    await db.update(jobsTable).set({ status, updateAt: now }).where(eq(jobsTable.externalId, externalId))
  }
  // TODO: lots of repetition here i wonder if we could/should create some generic for that ??
  return {
    async hasExternalId(externalId: string): Promise<boolean> {
      const rows = await db.select({ externalId: jobsTable.externalId }).from(jobsTable).where(eq(jobsTable.externalId, externalId)).limit(1)
      return rows.length > 0
    },
    async getJobStatus(externalId: string): Promise<StoredJob['status'] | undefined> {
      const rows = await db.select({ status: jobsTable.status }).from(jobsTable).where(eq(jobsTable.externalId, externalId)).limit(1)
      return rows[0]?.status as StoredJob['status'] | undefined
    },
    // here for example i wonder if it is good pattern ? to repet a lot similar things??
    async markJobFetching(externalId: string): Promise<void> {
      await updateJobStatus(externalId, 'fetching')
    },
    async markJobScoring(externalId: string): Promise<void> {
      await updateJobStatus(externalId, 'scoring')
    }
  }

}
