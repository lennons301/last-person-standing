-- Pay-the-creator links: where players pay a game creator when they run a game.
-- Both nullable — absent either one means no link, and collection stays manual.
ALTER TABLE "user" ADD COLUMN "payment_provider" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "payment_handle" text;--> statement-breakpoint

-- Drop the never-used `mangopay` payment method. Postgres can't remove a value
-- from an enum in place, so the type is rewritten: park the old type, create
-- the new one, convert the column, restore the default, drop the old type.
-- Zero rows reference `mangopay`, so the text round-trip cast is total — and if
-- one ever did, this fails loudly rather than silently rewriting it.
-- The default is dropped first so neither ALTER has to coerce it mid-swap.
ALTER TABLE "payment" ALTER COLUMN "method" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."payment_method" RENAME TO "payment_method_old";--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('manual');--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "method" SET DATA TYPE "public"."payment_method" USING "method"::text::"public"."payment_method";--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "method" SET DEFAULT 'manual';--> statement-breakpoint
DROP TYPE "public"."payment_method_old";
