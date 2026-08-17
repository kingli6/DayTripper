import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = new URL(rawDatabaseUrl);
const isSupabaseDatabase =
  databaseUrl.hostname.endsWith(".supabase.co") ||
  databaseUrl.hostname.endsWith(".supabase.com");

if (isSupabaseDatabase) {
  databaseUrl.searchParams.delete("sslmode");
  databaseUrl.searchParams.delete("uselibpqcompat");
}

export const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ...(isSupabaseDatabase
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
