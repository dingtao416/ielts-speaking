ALTER TABLE "framework" ADD COLUMN "stories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "session_record" ADD COLUMN "bands" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "target_band" numeric;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarded_at" timestamp;