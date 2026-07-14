CREATE TABLE "payment_verification" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_verification_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nano_id" varchar(11) NOT NULL UNIQUE,
	"payload_hash" varchar(64) NOT NULL,
	"x402_version" integer NOT NULL,
	"network" varchar(64) NOT NULL,
	"required_amount" text NOT NULL,
	"candidate_amount" text NOT NULL,
	"payer" text NOT NULL,
	"pay_to" text NOT NULL,
	"is_valid" boolean NOT NULL,
	"reason" text,
	"log_level" varchar(32) NOT NULL,
	"payload" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_verification_payload_hash_idx" ON "payment_verification" ("payload_hash");--> statement-breakpoint
CREATE INDEX "payment_verification_expires_at_idx" ON "payment_verification" ("expires_at");