import { pgTable, text, real, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const jobsTable = pgTable(
  "jobs",
  {
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
    /** Scoring lane: software | ai | both | null (legacy). */
    profile: text("profile"),
    status: text("status").notNull(),
    isApplied: boolean("is_applied").notNull().default(false),
    isNotInterested: boolean("is_not_interested").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "string" })
  },
  (table) => [
    index("jobs_status_idx").on(table.status),
    index("jobs_source_idx").on(table.source),
    index("jobs_created_at_idx").on(table.createdAt),
    index("jobs_updated_at_idx").on(table.updatedAt)
  ]
);
