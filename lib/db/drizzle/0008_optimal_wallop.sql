CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"subscription_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"reminder_type" text NOT NULL,
	"delivery_key" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retention_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"practice_id" integer NOT NULL,
	"recorded_date" date NOT NULL,
	"value" real NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_practices" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"direction" text DEFAULT 'higher' NOT NULL,
	"retention_speed" text DEFAULT 'moderate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "start_reminder_minutes" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "end_reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_observations" ADD CONSTRAINT "retention_observations_practice_id_retention_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."retention_practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_deliveries_subscription_key_unique" ON "reminder_deliveries" USING btree ("subscription_id","delivery_key");