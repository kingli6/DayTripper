ALTER TABLE "activities" DROP CONSTRAINT "activities_board_card_id_board_cards_id_fk";
--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "board_card_id";--> statement-breakpoint
ALTER TABLE "board_cards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "board_cards" CASCADE;