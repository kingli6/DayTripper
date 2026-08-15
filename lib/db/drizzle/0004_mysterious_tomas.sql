CREATE TABLE "activity_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"activity_id" integer,
	"scheduled_date" date NOT NULL,
	"activity_title" text,
	"change_type" text NOT NULL,
	"previous_title" text,
	"next_title" text,
	"previous_start_time" text,
	"next_start_time" text,
	"previous_end_time" text,
	"next_end_time" text,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
