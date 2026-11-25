CREATE TYPE "public"."action_layout" AS ENUM('http', 'code', 'rule_ref', 'status', 'text');--> statement-breakpoint
CREATE TABLE "action_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"layout" "action_layout" DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "rule_versions" ALTER COLUMN "code" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "trigger_condition" text;--> statement-breakpoint
ALTER TABLE "rule_versions" ADD COLUMN "actions" jsonb;--> statement-breakpoint
-- Προεπιλεγμένοι τύποι ενεργειών (οι χρήστες προσθέτουν κι άλλους από το UI).
INSERT INTO "action_types" ("name", "layout") VALUES ('Call Up URL', 'http'), ('Save Template Fields', 'code'), ('Apply Rule', 'rule_ref'), ('Change Status', 'status') ON CONFLICT ("name") DO NOTHING;
