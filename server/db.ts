import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

function getConnectionConfig() {
  const supabaseUrl = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
  if (supabaseUrl && supabaseUrl.startsWith("postgres")) {
    return {
      connectionString: supabaseUrl,
      ssl: { rejectUnauthorized: false },
    };
  }

  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    return {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || "5432"),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };
  }

  const connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.startsWith("postgres")) {
    return {
      connectionString,
    };
  }

  return null;
}

const config = getConnectionConfig();

if (!config) {
  console.warn("No valid database configuration found.");
}

const pool = config ? new pg.Pool(config) : null;

export const db = pool ? drizzle(pool, { schema }) : null;
