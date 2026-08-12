CREATE TABLE "standings_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"matchday" integer NOT NULL,
	"position" integer NOT NULL,
	"played" integer NOT NULL,
	"won" integer NOT NULL,
	"drawn" integer NOT NULL,
	"lost" integer NOT NULL,
	"points" integer NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standings_snapshot" ADD CONSTRAINT "standings_snapshot_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings_snapshot" ADD CONSTRAINT "standings_snapshot_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "standings_snapshot_comp_team_matchday_idx" ON "standings_snapshot" USING btree ("competition_id","team_id","matchday");