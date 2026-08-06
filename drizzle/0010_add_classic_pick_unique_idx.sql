-- Defensive dedupe before the unique index. Classic picks have a NULL
-- confidence_rank, so nothing has ever stopped two concurrent writers from both
-- inserting a pick for the same player + round. Any such duplicate would make
-- the CREATE UNIQUE INDEX below fail (and take the migrate workflow with it), so
-- collapse each (game_player_id, round_id) group to a single row first:
-- human-submitted picks win over automated ones, then earliest created_at, then
-- id for a deterministic tiebreak.
DELETE FROM "pick" AS p
USING (
	SELECT id FROM (
		SELECT
			id,
			row_number() OVER (
				PARTITION BY "game_player_id", "round_id"
				ORDER BY ("is_auto" OR "auto_submitted") ASC, "created_at" ASC, id ASC
			) AS rn
		FROM "pick"
		WHERE "confidence_rank" IS NULL
	) ranked
	WHERE rn > 1
) dupes
WHERE p.id = dupes.id;--> statement-breakpoint
CREATE UNIQUE INDEX "pick_player_round_classic_idx" ON "pick" USING btree ("game_player_id","round_id") WHERE "pick"."confidence_rank" is null;
