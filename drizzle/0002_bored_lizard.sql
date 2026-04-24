ALTER TABLE "team" ADD COLUMN "league_position" integer;--> statement-breakpoint
ALTER TABLE "game_player" ADD COLUMN "eliminated_reason" text;--> statement-breakpoint
ALTER TABLE "pick" ADD COLUMN "is_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "refunded_at" timestamp;