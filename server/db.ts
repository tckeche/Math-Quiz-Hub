import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("SUPABASE_URL / DATABASE_URL is not set. Falling back to in-memory storage.");
}

function shouldUseSsl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("supabase.co") || lower.includes("sslmode=require") || process.env.PGSSLMODE === "require";
}

const pool = connectionString
  ? new pg.Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_POOL_MAX || 10),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;
