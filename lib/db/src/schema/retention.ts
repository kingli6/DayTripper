import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const retentionPracticesTable = pgTable("retention_practices", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  direction: text("direction").notNull().default("higher"),
  retentionSpeed: text("retention_speed").notNull().default("moderate"),
  repeatIntervalDays: integer("repeat_interval_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const retentionObservationsTable = pgTable("retention_observations", {
  id: serial("id").primaryKey(),
  practiceId: integer("practice_id")
    .notNull()
    .references(() => retentionPracticesTable.id, { onDelete: "cascade" }),
  recordedDate: date("recorded_date", { mode: "string" }).notNull(),
  value: real("value").notNull(),
  context: text("context"),
  curveHalfLifeDays: integer("curve_half_life_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRetentionPracticeSchema = createInsertSchema(retentionPracticesTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRetentionObservationSchema = createInsertSchema(retentionObservationsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRetentionPractice = z.infer<typeof insertRetentionPracticeSchema>;
export type RetentionPractice = typeof retentionPracticesTable.$inferSelect;
export type InsertRetentionObservation = z.infer<typeof insertRetentionObservationSchema>;
export type RetentionObservation = typeof retentionObservationsTable.$inferSelect;