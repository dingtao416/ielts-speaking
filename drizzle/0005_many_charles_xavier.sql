ALTER TABLE "practice_session" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "question_delivery" ADD COLUMN "topic" varchar(200) NOT NULL;