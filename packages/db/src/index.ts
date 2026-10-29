import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export * from "./videos";
export { schema };

export type Db = PostgresJsDatabase<typeof schema>;

let cached: { db: Db; sql: postgres.Sql } | undefined;

export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = postgres(url, { max: Number(process.env.DATABASE_POOL ?? 5) });
    cached = { db: drizzle(sql, { schema }), sql };
  }
  return cached.db;
}

export async function closeDb(): Promise<void> {
  await cached?.sql.end();
  cached = undefined;
}
