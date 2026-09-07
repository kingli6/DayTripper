-- Existing recurrence data is intentionally reset as part of the recurrence model replacement.
UPDATE "tasks" SET "next_occurrence_at" = NULL;

ALTER TABLE "tasks" DROP COLUMN "recurrence";
ALTER TABLE "tasks" ADD COLUMN "repeat_interval_minutes" integer;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_repeat_interval_minutes_check"
  CHECK ("repeat_interval_minutes" IS NULL OR "repeat_interval_minutes" >= 1);

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_repeat_interval_consistency_check"
  CHECK (
    ("repeat_interval_minutes" IS NULL AND "next_occurrence_at" IS NULL)
    OR
    ("repeat_interval_minutes" IS NOT NULL AND "next_occurrence_at" IS NOT NULL)
  );