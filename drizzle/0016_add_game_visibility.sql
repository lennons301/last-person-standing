CREATE TYPE "public"."game_visibility" AS ENUM('public', 'private');--> statement-breakpoint
-- Every pre-existing game is backfilled to 'public' by the column default, which
-- Postgres applies to the existing rows as it adds a NOT NULL column. Safe by
-- construction rather than by luck: publishing a started or completed game
-- changes what is *visible*, never what is *joinable*.
ALTER TABLE "game" ADD COLUMN "visibility" "game_visibility" DEFAULT 'public' NOT NULL;
