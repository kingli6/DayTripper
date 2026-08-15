import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const appMetadataTable = pgTable("app_metadata", {
  id: text("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAppMetadataSchema = createInsertSchema(appMetadataTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertAppMetadata = z.infer<typeof insertAppMetadataSchema>;
export type AppMetadata = typeof appMetadataTable.$inferSelect;