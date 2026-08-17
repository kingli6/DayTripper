CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"recorded_date" date NOT NULL,
	"content" text NOT NULL,
	"activity_id" integer,
	"topic" text,
	"privacy" text DEFAULT 'private' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
