CREATE TABLE "jobs" (
	"external_id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"salary_text" text,
	"location" text,
	"offer_markdown" text,
	"match_score" real,
	"match_reason" text,
	"summary" text,
	"status" text NOT NULL,
	"is_applied" boolean DEFAULT false NOT NULL,
	"is_not_interested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_source_idx" ON "jobs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jobs_updated_at_idx" ON "jobs" USING btree ("updated_at");