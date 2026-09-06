CREATE TABLE "execution_interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"question_index" integer DEFAULT 1 NOT NULL,
	"current_question" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);