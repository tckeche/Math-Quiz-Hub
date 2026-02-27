import pg from "pg";
import readline from "readline";

const SUPER_ADMIN_EMAIL = "admin.soma@melaniacalvin.com";

const rawConnectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;

if (!rawConnectionString) {
  console.error("ERROR: No database connection string found (SUPABASE_URL or DATABASE_URL).");
  process.exit(1);
}

function shouldUseSsl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("supabase.co") || lower.includes("sslmode=require") || process.env.PGSSLMODE === "require";
}

function stripSslMode(url: string): string {
  return url.replace(/[?&]sslmode=[^&]*/gi, "").replace(/\?$/, "");
}

const useSsl = shouldUseSsl(rawConnectionString);
const connectionString = useSsl ? stripSslMode(rawConnectionString) : rawConnectionString;

const pool = new pg.Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    SOMA DATABASE CLEAN SLATE               ║");
  console.log("║                                                            ║");
  console.log("║  WARNING: This will PERMANENTLY DELETE all development     ║");
  console.log("║  data from the database including:                         ║");
  console.log("║                                                            ║");
  console.log("║    - All tutor comments                                    ║");
  console.log("║    - All quiz assignments                                  ║");
  console.log("║    - All student reports                                   ║");
  console.log("║    - All tutor-student relationships                       ║");
  console.log("║    - All questions                                         ║");
  console.log("║    - All quizzes                                           ║");
  console.log("║    - All non-super_admin users                             ║");
  console.log("║                                                            ║");
  console.log(`║  PROTECTED: ${SUPER_ADMIN_EMAIL}          ║`);
  console.log("║                                                            ║");
  console.log("║  THIS ACTION CANNOT BE UNDONE.                             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const confirm1 = await ask('Type "CLEAN SLATE" to proceed: ');
  if (confirm1 !== "CLEAN SLATE") {
    console.log("Aborted. No data was deleted.");
    process.exit(0);
  }

  const confirm2 = await ask("Are you absolutely sure? (yes/no): ");
  if (confirm2.toLowerCase() !== "yes") {
    console.log("Aborted. No data was deleted.");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const steps: [string, string][] = [
      ["tutor_comments", "DELETE FROM tutor_comments"],
      ["quiz_assignments", "DELETE FROM quiz_assignments"],
      ["soma_reports", "DELETE FROM soma_reports"],
      ["tutor_students", "DELETE FROM tutor_students"],
      ["soma_questions", "DELETE FROM soma_questions"],
      ["soma_quizzes", "DELETE FROM soma_quizzes"],
      ["soma_users (non-admin)", `DELETE FROM soma_users WHERE role != 'super_admin' AND email != '${SUPER_ADMIN_EMAIL}'`],
    ];

    for (const [label, query] of steps) {
      const result = await client.query(query);
      console.log(`  Deleted ${result.rowCount ?? 0} rows from ${label}`);
    }

    const preserved = await client.query(
      `SELECT id, email, role FROM soma_users WHERE email = $1`,
      [SUPER_ADMIN_EMAIL]
    );
    if (preserved.rows.length > 0) {
      console.log(`\n  Super Admin preserved: ${preserved.rows[0].email} (${preserved.rows[0].role})`);
    } else {
      console.log("\n  Note: No super admin account found in database.");
    }

    await client.query("COMMIT");
    console.log("\n  Database cleaned successfully.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n  ERROR: Clean slate failed. All changes rolled back.", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
