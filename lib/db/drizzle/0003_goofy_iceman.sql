ALTER TABLE "activities" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;