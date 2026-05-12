ALTER TABLE "pick" ADD COLUMN "life_gained" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pick" ADD COLUMN "life_spent" boolean DEFAULT false NOT NULL;