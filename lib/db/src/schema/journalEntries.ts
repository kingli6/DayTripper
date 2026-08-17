import { createInsertSchema } from "drizzle-zod";
import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  recordedDate: date("recorded_date", { mode: "string" }).notNull(),
  content: text("content").notNull(),
  activityId: integer("activity_id"),
  topic: text("topic"),
  privacy: text("privacy").notNull().default("private"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({
  id: true,
  recordedAt: true,
});

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;