CREATE TABLE "pin_searches" (
	"query" text PRIMARY KEY NOT NULL,
	"urls" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
