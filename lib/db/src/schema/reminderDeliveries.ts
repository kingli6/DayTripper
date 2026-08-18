import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const reminderDeliveriesTable = pgTable(
  "reminder_deliveries",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    subscriptionId: integer("subscription_id").notNull(),
    activityId: integer("activity_id").notNull(),
    reminderType: text("reminder_type").notNull(),
    deliveryKey: text("delivery_key").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => ({
    deliveryUnique: uniqueIndex("reminder_deliveries_subscription_key_unique").on(
      table.subscriptionId,
      table.deliveryKey,
    ),
  }),
);

export const insertReminderDeliverySchema = createInsertSchema(reminderDeliveriesTable).omit({
  id: true,
  claimedAt: true,
  sentAt: true,
});

export type InsertReminderDelivery = z.infer<typeof insertReminderDeliverySchema>;
export type ReminderDelivery = typeof reminderDeliveriesTable.$inferSelect;