import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const activityChangesTable = pgTable("activity_changes", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  activityId: integer("activity_id"),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  activityTitle: text("activity_title"),
  changeType: text("change_type").notNull(),
  previousTitle: text("previous_title"),
  nextTitle: text("next_title"),
  previousStartTime: text("previous_start_time"),
  nextStartTime: text("next_start_time"),
  previousEndTime: text("previous_end_time"),
  nextEndTime: text("next_end_time"),
  note: text("note"),
  source: text("source").notNull().default("manual"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivityChangeSchema = createInsertSchema(activityChangesTable).omit({
  id: true,
  changedAt: true,
});

export type InsertActivityChange = z.infer<typeof insertActivityChangeSchema>;
export type ActivityChange = typeof activityChangesTable.$inferSelect;