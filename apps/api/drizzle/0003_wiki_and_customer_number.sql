CREATE TYPE "public"."field_system" AS ENUM('myclaim', 'wedat');--> statement-breakpoint
CREATE TYPE "public"."wiki_category" AS ENUM('guide', 'general', 'rules');--> statement-breakpoint
CREATE TABLE "wiki_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" "wiki_category" DEFAULT 'guide' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"system" "field_system" NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"type" text,
	"description" text,
	"example" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_field_unique" ON "wiki_fields" USING btree ("system","name");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customer_number_7_digits" CHECK ("customers"."customer_number" ~ '^[0-9]{7}$');