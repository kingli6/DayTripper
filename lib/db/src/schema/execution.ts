import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const executionObservationsTable = pgTable("execution_observations", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  dimension: text("dimension").notNull(),
  finding: text("finding").notNull(),
  stateContext: text("state_context"),
  confidence: real("confidence").notNull(),
  evidenceCount: integer("evidence_count").notNull().default(0),
  source: text("source").notNull(),
  capabilities: text("capabilities").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const executionStateTable = pgTable("execution_state", {
  ownerId: text("owner_id").primaryKey(),
  energy: text("energy"),
  stress: text("stress"),
  availableMinutes: integer("available_minutes"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionSessionsTable = pgTable("execution_sessions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  taskId: integer("task_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  plannedMinutes: integer("planned_minutes").notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  firstAction: text("first_action").notNull(),
  stoppingPoint: text("stopping_point").notNull(),
}, (table) => ({
  oneActivePerOwner: uniqueIndex("execution_sessions_one_active_owner")
    .on(table.ownerId)
    .where(sql`${table.status} = 'active'`),
}));

export const insertExecutionObservationSchema = createInsertSchema(executionObservationsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExecutionStateSchema = createInsertSchema(executionStateTable).omit({
  ownerId: true,
  capturedAt: true,
});

export type InsertExecutionObservation = z.infer<typeof insertExecutionObservationSchema>;
export type ExecutionObservation = typeof executionObservationsTable.$inferSelect;
export type InsertExecutionState = z.infer<typeof insertExecutionStateSchema>;
export type ExecutionState = typeof executionStateTable.$inferSelect;
export const insertExecutionSessionSchema = createInsertSchema(executionSessionsTable).omit({
  id: true,
  ownerId: true,
  startedAt: true,
  endedAt: true,
  status: true,
});
export type InsertExecutionSession = z.infer<typeof insertExecutionSessionSchema>;
export type ExecutionSession = typeof executionSessionsTable.$inferSelect;