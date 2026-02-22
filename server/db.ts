import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

function getConnectionString(): string | null {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    if (process.env.PGHOST && process.env.PGDATABASE) {
      const user = process.env.PGUSER || "postgres";
      const password = process.env.PGPASSWORD || "";
      const host = process.env.PGHOST;
      const port = process.env.PGPORT || "5432";
      const database = process.env.PGDATABASE;
      return `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }
    if (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith("postgresql://") || process.env.DATABASE_URL.startsWith("postgres://"))) {
      return process.env.DATABASE_URL;
    }
  }

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

  return null;
}

const connectionString = getConnectionString();

if (!connectionString) {
  console.warn("No valid database connection string found. Falling back to in-memory storage.");
}

const isLocalDb = connectionString
  ? connectionString.includes("@localhost") || connectionString.includes("@127.0.0.1") || connectionString.includes("@helium")
  : true;

const poolConfig: pg.PoolConfig = {
  connectionString: connectionString || undefined,
};

if (!isLocalDb) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = connectionString
  ? new pg.Pool(poolConfig)
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;
