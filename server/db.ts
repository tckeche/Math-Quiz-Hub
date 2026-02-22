import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

function getConnectionString(): string | null {
  const candidates = [
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
  ];

  for (const url of candidates) {
    if (url && (url.startsWith("postgresql://") || url.startsWith("postgres://"))) {
      return url;
    }
  }

  if (process.env.PGHOST && process.env.PGDATABASE) {
    const user = process.env.PGUSER || "postgres";
    const password = process.env.PGPASSWORD || "";
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || "5432";
    const database = process.env.PGDATABASE;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }

  return null;
}

const connectionString = getConnectionString();

if (!connectionString) {
  console.warn("No valid database connection string found. Falling back to in-memory storage.");
}

const pool = connectionString
  ? new pg.Pool({ connectionString })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;
