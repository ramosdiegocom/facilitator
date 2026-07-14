CREATE TABLE "api_key" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_key_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nano_id" varchar(11) NOT NULL UNIQUE,
	"resource_server_id" bigint NOT NULL,
	"organization_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" text NOT NULL UNIQUE,
	"key_prefix" varchar(64) NOT NULL,
	"scopes" text NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resource_server" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "resource_server_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nano_id" varchar(11) NOT NULL UNIQUE,
	"organization_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_key_resource_server_id_idx" ON "api_key" ("resource_server_id");--> statement-breakpoint
CREATE INDEX "api_key_organization_id_idx" ON "api_key" ("organization_id");--> statement-breakpoint
CREATE INDEX "api_key_created_by_idx" ON "api_key" ("created_by");--> statement-breakpoint
CREATE INDEX "api_key_key_prefix_idx" ON "api_key" ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_key_revoked_at_idx" ON "api_key" ("revoked_at");--> statement-breakpoint
CREATE INDEX "resource_server_organization_id_idx" ON "resource_server" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_server_org_identifier_unique" ON "resource_server" ("organization_id","identifier");--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_resource_server_id_resource_server_id_fkey" FOREIGN KEY ("resource_server_id") REFERENCES "resource_server"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resource_server" ADD CONSTRAINT "resource_server_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;