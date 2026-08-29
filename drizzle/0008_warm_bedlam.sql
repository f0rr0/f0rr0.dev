CREATE TABLE "github_repository_refs" (
	"active" boolean DEFAULT true NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"head_sha" varchar(40) NOT NULL,
	"kind" varchar(8) NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ref_name" text NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	CONSTRAINT "github_repository_refs_repository_id_ref_name_pk" PRIMARY KEY("repository_id","ref_name"),
	CONSTRAINT "github_repository_refs_kind" CHECK ("github_repository_refs"."kind" IN ('head', 'tag')),
	CONSTRAINT "github_repository_refs_name" CHECK (("github_repository_refs"."kind" = 'head' AND "github_repository_refs"."ref_name" LIKE 'refs/heads/%') OR ("github_repository_refs"."kind" = 'tag' AND "github_repository_refs"."ref_name" LIKE 'refs/tags/%')),
	CONSTRAINT "github_repository_refs_sha_shape" CHECK ("github_repository_refs"."head_sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "github_repository_refs_observation_order" CHECK ("github_repository_refs"."last_observed_at" >= "github_repository_refs"."first_observed_at")
);
--> statement-breakpoint
ALTER TABLE "github_repository_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_push_observations" DROP CONSTRAINT "github_push_observations_source";--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD CONSTRAINT "github_repository_refs_repository_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_repository_refs_active_idx" ON "github_repository_refs" USING btree ("repository_id","active");--> statement-breakpoint
ALTER TABLE "github_push_observations" ADD CONSTRAINT "github_push_observations_source" CHECK ("github_push_observations"."source" IN ('webhook', 'events', 'refs'));