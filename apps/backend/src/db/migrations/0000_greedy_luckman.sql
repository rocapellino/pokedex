CREATE SEQUENCE "public"."pokedex_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1009 CACHE 1;--> statement-breakpoint
CREATE TABLE "pokedex_entries" (
	"id" integer PRIMARY KEY NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_pokedex_tipo" ON "pokedex_entries" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "idx_pokedex_nombre" ON "pokedex_entries" USING btree ("nombre");