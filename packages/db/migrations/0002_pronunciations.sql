CREATE TABLE "pronunciations" (
	"word" text PRIMARY KEY NOT NULL,
	"say" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
