ALTER TABLE "tasks" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "next_occurrence_at" timestamp with time zone;