ALTER TABLE "game" ADD COLUMN "starting_round_id" uuid;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_starting_round_id_round_id_fk" FOREIGN KEY ("starting_round_id") REFERENCES "public"."round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill: the round each existing game was played from. `current_round_id`
-- advances as a game goes on, so it only answers this for a game that hasn't
-- moved yet — the lowest-numbered round *anybody* in the game ever picked in is
-- what remembers where it began. Every player's picks count, not just one's: a
-- player who missed the opening round has no pick there to anchor it and their
-- rivals do. A game nobody has picked in yet has not moved, so its current
-- round is still its starting round.
UPDATE "game" SET "starting_round_id" = COALESCE(
	(
		SELECT "pick"."round_id"
		FROM "pick"
		INNER JOIN "round" ON "round"."id" = "pick"."round_id"
		WHERE "pick"."game_id" = "game"."id"
		ORDER BY "round"."number" ASC
		LIMIT 1
	),
	"game"."current_round_id"
);
