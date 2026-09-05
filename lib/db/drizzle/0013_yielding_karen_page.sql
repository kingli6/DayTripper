CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"importance" integer NOT NULL,
	"urgency" integer NOT NULL,
	"energy_required" integer NOT NULL,
	"interest" integer NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'inbox' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
