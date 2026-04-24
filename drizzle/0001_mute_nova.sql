ALTER TYPE "public"."payment_status" ADD VALUE 'claimed' BEFORE 'paid';--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "claimed_at" timestamp;