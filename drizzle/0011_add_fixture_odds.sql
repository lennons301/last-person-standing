CREATE TABLE "fixture_odds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"source" varchar(50) NOT NULL,
	"bookmaker" varchar(50) NOT NULL,
	"home_price" double precision NOT NULL,
	"draw_price" double precision NOT NULL,
	"away_price" double precision NOT NULL,
	"home_probability" double precision NOT NULL,
	"draw_probability" double precision NOT NULL,
	"away_probability" double precision NOT NULL,
	"as_of" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fixture_odds" ADD CONSTRAINT "fixture_odds_fixture_id_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixture_odds_fixture_idx" ON "fixture_odds" USING btree ("fixture_id");