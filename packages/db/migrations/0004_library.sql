CREATE TABLE "library" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"words" text NOT NULL,
	"text" text NOT NULL,
	"label" text NOT NULL,
	"files" jsonb NOT NULL,
	"cut" boolean DEFAULT false NOT NULL,
	"videos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "library_used_idx" ON "library" USING btree ("used_at");