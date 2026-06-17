import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const jobsTable = sqliteTable("jobs", {
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
  isApplied: integer("is_applied").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  postedAt: text("posted_at")
});
