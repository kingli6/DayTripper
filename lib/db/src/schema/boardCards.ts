import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const boardCardsTable = pgTable("board_cards", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  note: text("note"),
  category: text("category").notNull(),
  priority: integer("priority").notNull(),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  deadline: timestamp("deadline", { withTimezone: true }),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const insertBoardCardSchema = createInsertSchema(boardCardsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});

export type InsertBoardCard = z.infer<typeof insertBoardCardSchema>;
export type BoardCard = typeof boardCardsTable.$inferSelect;