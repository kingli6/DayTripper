ALTER TABLE "execution_observations" ADD COLUMN "capabilities" text[] DEFAULT '{}'::text[] NOT NULL;
DROP TABLE IF EXISTS "execution_interviews";