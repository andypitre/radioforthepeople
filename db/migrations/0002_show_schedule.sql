CREATE TYPE "public"."schedule_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "schedule_cadence" "schedule_cadence";--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "schedule_day_of_week" integer;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "schedule_day_of_month" integer;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "schedule_time" time;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "schedule_timezone" text;
