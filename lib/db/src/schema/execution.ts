import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
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