ALTER TABLE "competition" ADD COLUMN "family_key" varchar(100);--> statement-breakpoint
-- Backfill: every existing competition joins the family it is a season of.
-- FPL is the Premier League and nothing else (see bootstrap-competitions.ts),
-- so every fpl-sourced row — this season's and every archived predecessor —
-- shares the Premier League key. Manual/dev competitions belong to no family
-- and keep their null.
UPDATE "competition" SET "family_key" = 'premier-league' WHERE "data_source" = 'fpl';--> statement-breakpoint
UPDATE "competition" SET "family_key" = 'fifa-world-cup' WHERE "data_source" = 'football_data' AND "external_id" = 'WC';
