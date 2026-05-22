CREATE TABLE "cron_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route" varchar(100) NOT NULL,
	"started_at" timestamp NOT NULL,
	"duration_ms" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
