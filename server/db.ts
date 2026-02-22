import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Falling back to in-memory storage.");
}

const pool = connectionString
  ? new pg.Pool({
      connectionString,
    })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;
