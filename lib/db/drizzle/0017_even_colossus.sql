CREATE TABLE "execution_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"dimension" text NOT NULL,
	"finding" text NOT NULL,
	"state_context" text,
	"confidence" real NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_state" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"energy" text,
	"stress" text,
	"available_minutes" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
