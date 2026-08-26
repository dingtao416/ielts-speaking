CREATE TABLE "diagnostic_assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"standard_response_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"band_evidence" jsonb,
	"active_stage_band" numeric(3, 1),
	"confidence" numeric(3, 2),
	"status" varchar(16) DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" varchar(32) NOT NULL,
	"topic_set_key" varchar(200) NOT NULL,
	"bank_version" varchar(64) NOT NULL,
	"diagnostic_eligible" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"question_id" varchar(200) NOT NULL,
	"order_no" integer NOT NULL,
	"text_snapshot" text NOT NULL,
	"bank_version" varchar(64) NOT NULL,
	"delivery_source" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"question_delivery_id" text NOT NULL,
	"audio_ref" varchar(200),
	"final_transcript" text NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"ended_by" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"response_attempt_id" text NOT NULL,
	"active_stage_band" numeric(3, 1),
	"vocabulary_highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"natural_rewrite" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"feedback_version" varchar(32),
	"model_version" varchar(64),
	"schema_version" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_feedback_response_attempt_id_unique" UNIQUE("response_attempt_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "final_goal_band" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "current_band" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "active_stage_band" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stage_plan" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "diagnostic_status" varchar(16) DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "diagnostic_assessment" ADD CONSTRAINT "diagnostic_assessment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_assessment" ADD CONSTRAINT "diagnostic_assessment_session_id_practice_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_delivery" ADD CONSTRAINT "question_delivery_session_id_practice_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_attempt" ADD CONSTRAINT "response_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_attempt" ADD CONSTRAINT "response_attempt_session_id_practice_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_attempt" ADD CONSTRAINT "response_attempt_question_delivery_id_question_delivery_id_fk" FOREIGN KEY ("question_delivery_id") REFERENCES "public"."question_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_feedback" ADD CONSTRAINT "response_feedback_response_attempt_id_response_attempt_id_fk" FOREIGN KEY ("response_attempt_id") REFERENCES "public"."response_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnostic_assessment_user_created_idx" ON "diagnostic_assessment" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "practice_session_user_start_idx" ON "practice_session" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "question_delivery_session_order_uq" ON "question_delivery" USING btree ("session_id","order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "response_attempt_session_delivery_uq" ON "response_attempt" USING btree ("session_id","question_delivery_id");--> statement-breakpoint
CREATE INDEX "response_attempt_user_created_idx" ON "response_attempt" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "response_feedback_attempt_idx" ON "response_feedback" USING btree ("response_attempt_id");