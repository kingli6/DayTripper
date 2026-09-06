CREATE TABLE "execution_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"task_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"planned_minutes" integer NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"first_action" text NOT NULL,
	"stopping_point" text NOT NULL
);
