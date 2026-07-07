import { pgTable, text, real, boolean } from "drizzle-orm/pg-core";

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
