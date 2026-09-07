import { createInsertSchema } from "drizzle-zod";
import { check, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  importance: integer("importance").notNull(),
  urgency: integer("urgency").notNull(),
  energyRequired: integer("energy_required").notNull(),
  interest: integer("interest").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  repeatIntervalMinutes: integer("repeat_interval_minutes"),
  nextOccurrenceAt: timestamp("next_occurrence_at", { withTimezone: true }),
  status: text("status").notNull().default("inbox"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  check(
    "tasks_repeat_interval_minutes_check",
    sql`${table.repeatIntervalMinutes} IS NULL OR ${table.repeatIntervalMinutes} >= 1`,
  ),
  check(
    "tasks_repeat_interval_consistency_check",
    sql`(${table.repeatIntervalMinutes} IS NULL AND ${table.nextOccurrenceAt} IS NULL)
      OR
      (${table.repeatIntervalMinutes} IS NOT NULL AND ${table.nextOccurrenceAt} IS NOT NULL)`,
  ),
]);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  nextOccurrenceAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;