CREATE TABLE "wiki_article_fields" (
	"article_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "wiki_article_fields_article_id_field_id_pk" PRIMARY KEY("article_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "wiki_article_rules" (
	"article_id" integer NOT NULL,
	"rule_id" integer NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "wiki_article_rules_article_id_rule_id_pk" PRIMARY KEY("article_id","rule_id")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "git_url" text;--> statement-breakpoint
ALTER TABLE "wiki_article_fields" ADD CONSTRAINT "wiki_article_fields_article_id_wiki_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."wiki_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_article_fields" ADD CONSTRAINT "wiki_article_fields_field_id_wiki_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."wiki_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_article_rules" ADD CONSTRAINT "wiki_article_rules_article_id_wiki_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."wiki_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_article_rules" ADD CONSTRAINT "wiki_article_rules_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;