import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type ExecutionInterviewMessage = {
  role: "user" | "assistant";
  content: string;
};

export const executionInterviewsTable = pgTable("execution_interviews", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull().default("active"),
  questionIndex: integer("question_index").notNull().default(1),
  currentQuestion: text("current_question"),
  messages: jsonb("messages").$type<ExecutionInterviewMessage[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const insertExecutionInterviewSchema = createInsertSchema(executionInterviewsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  finishedAt: true,
});

export type InsertExecutionInterview = z.infer<typeof insertExecutionInterviewSchema>;
export type ExecutionInterview = typeof executionInterviewsTable.$inferSelect;