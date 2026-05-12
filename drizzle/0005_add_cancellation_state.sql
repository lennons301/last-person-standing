ALTER TYPE "public"."fixture_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."pick_result" ADD VALUE 'void';--> statement-breakpoint
ALTER TABLE "round" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "pick" ADD COLUMN "cancellation_reason" text;