import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

function shouldUseSsl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("supabase.co") || lower.includes("sslmode=require") || process.env.PGSSLMODE === "require";
}

function stripSslMode(url: string): string {
  return url.replace(/[?&]sslmode=[^&]*/gi, "").replace(/\?$/, "");
}

function createPool(rawUrl: string): pg.Pool {
  const useSsl = shouldUseSsl(rawUrl);
  const connectionString = useSsl ? stripSslMode(rawUrl) : rawUrl;
  return new pg.Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PG_POOL_MAX || 10),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  });
}

export let pool: pg.Pool | null = null;
export let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function connectDb() {
  const candidates = [
    process.env.SUPABASE_URL,
    process.env.SUPABASE_DB_URL,
    process.env.DATABASE_URL,
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    try {
      const p = createPool(url);
      await p.query("SELECT 1");
      const host = url.split("@")[1]?.split("/")[0] || "unknown";
      console.log(`[db] connected to ${host}`);
      pool = p;
      db = drizzle(p, { schema });
      return;
    } catch (e: any) {
      const host = url.split("@")[1]?.split("/")[0] || "unknown";
      console.warn(`[db] failed to connect to ${host}: ${e.message}`);
    }
  }

  console.warn("[db] no database connected, falling back to in-memory storage");
  pool = null;
  db = null;
}
