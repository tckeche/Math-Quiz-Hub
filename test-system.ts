import 'dotenv/config';
import { db } from './server/db';
import { somaUsers, somaQuizzes, somaReports } from './shared/schema';
import { sql } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { generateWithFallback } from './server/services/aiOrchestrator';

const PASS = "✅";
const FAIL = "❌";
const INFO = "ℹ️";
const DIVIDER = "─".repeat(60);

async function testDatabaseSchema() {
  console.log("\n" + DIVIDER);
  console.log("  TEST 1: DATABASE & SCHEMA CHECK");
  console.log(DIVIDER);

  if (!db) {
    console.log(`${FAIL} Database client is null. Check DATABASE_URL environment variable.`);
    return false;
  }
  console.log(`${PASS} Database client initialized.`);

  try {
    const usersResult = await db.select({ count: sql<number>`count(*)` }).from(somaUsers);
    console.log(`${PASS} soma_users table exists — ${usersResult[0].count} record(s)`);
  } catch (e: any) {
    console.log(`${FAIL} soma_users query failed: ${e.message}`);
    return false;
  }

  try {
    const quizzesResult = await db.select({ count: sql<number>`count(*)` }).from(somaQuizzes);
    console.log(`${PASS} soma_quizzes table exists — ${quizzesResult[0].count} record(s)`);
  } catch (e: any) {
    console.log(`${FAIL} soma_quizzes query failed: ${e.message}`);
    return false;
  }

  try {
    const reportsResult = await db.select({ count: sql<number>`count(*)` }).from(somaReports);
    console.log(`${PASS} soma_reports table exists — ${reportsResult[0].count} record(s)`);
  } catch (e: any) {
    console.log(`${FAIL} soma_reports query failed: ${e.message}`);
    return false;
  }

  console.log(`${PASS} All database tables verified.`);
  return true;
}

async function testSupabaseClient() {
  console.log("\n" + DIVIDER);
  console.log("  TEST 2: SUPABASE SERVER CLIENT CHECK");
  console.log(DIVIDER);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    console.log(`${FAIL} SUPABASE_URL / VITE_SUPABASE_URL is not set.`);
    return false;
  }
  console.log(`${PASS} Supabase URL loaded: ${supabaseUrl.substring(0, 30)}...`);

  if (!supabaseKey) {
    console.log(`${FAIL} SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY is not set.`);
    return false;
  }
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "SERVICE_ROLE_KEY" : "ANON_KEY";
  console.log(`${PASS} Supabase key loaded (${keyType}): ${supabaseKey.substring(0, 20)}...`);

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.log(`${FAIL} Supabase auth check failed: ${error.message}`);
      return false;
    }
    console.log(`${PASS} Supabase client initialized and auth endpoint reachable.`);
    console.log(`${INFO} Current session: ${data.session ? "Active" : "None (expected for server-side)"}`);
  } catch (e: any) {
    console.log(`${FAIL} Supabase client error: ${e.message}`);
    return false;
  }

  return true;
}

async function testAIOrchestrator() {
  console.log("\n" + DIVIDER);
  console.log("  TEST 3: AI FALLBACK ORCHESTRATOR (CLAUDE CHECK)");
  console.log(DIVIDER);

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;

  console.log(`${INFO} API Keys available:`);
  console.log(`   Anthropic: ${hasAnthropicKey ? PASS : FAIL}`);
  console.log(`   Gemini:    ${hasGeminiKey ? PASS : FAIL}`);
  console.log(`   OpenAI:    ${hasOpenAIKey ? PASS : FAIL}`);
  console.log(`   DeepSeek:  ${hasDeepSeekKey ? PASS : FAIL}`);

  if (!hasAnthropicKey && !hasGeminiKey && !hasOpenAIKey && !hasDeepSeekKey) {
    console.log(`${FAIL} No AI API keys found. Cannot test orchestrator.`);
    return false;
  }

  const schema = {
    type: "object",
    properties: {
      question: { type: "string" },
      answer: { type: "string" },
    },
    required: ["question", "answer"],
  };

  try {
    console.log(`${INFO} Sending test request to AI orchestrator...`);
    const startTime = Date.now();

    const result = await generateWithFallback(
      "You are a trivia question generator. Return exactly one trivia question with its answer as JSON.",
      "Generate 1 simple math trivia question. Keep it short.",
      schema
    );

    const elapsed = Date.now() - startTime;
    console.log(`${PASS} AI orchestrator responded in ${elapsed}ms.`);
    console.log(`${INFO} Model used: ${result.metadata.model} (${result.metadata.provider})`);
    console.log(`${INFO} Latency: ${result.metadata.latencyMs}ms`);

    try {
      const parsed = JSON.parse(result.data);
      console.log(`${PASS} Response is valid JSON.`);
      console.log(`${INFO} Question: "${parsed.question}"`);
      console.log(`${INFO} Answer: "${parsed.answer}"`);
    } catch {
      console.log(`${FAIL} Response is NOT valid JSON: ${result.data.substring(0, 200)}`);
      return false;
    }
  } catch (e: any) {
    console.log(`${FAIL} AI orchestrator failed: ${e.message}`);
    return false;
  }

  return true;
}

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  🔬 SOMA SYSTEM DIAGNOSTIC — END-TO-END HEALTH CHECK");
  console.log("═".repeat(60));
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  const results: { test: string; passed: boolean }[] = [];

  try {
    results.push({ test: "Database & Schema", passed: await testDatabaseSchema() });
  } catch (e: any) {
    console.log(`${FAIL} UNHANDLED ERROR in Test 1: ${e.message}`);
    results.push({ test: "Database & Schema", passed: false });
  }

  try {
    results.push({ test: "Supabase Client", passed: await testSupabaseClient() });
  } catch (e: any) {
    console.log(`${FAIL} UNHANDLED ERROR in Test 2: ${e.message}`);
    results.push({ test: "Supabase Client", passed: false });
  }

  try {
    results.push({ test: "AI Orchestrator", passed: await testAIOrchestrator() });
  } catch (e: any) {
    console.log(`${FAIL} UNHANDLED ERROR in Test 3: ${e.message}`);
    results.push({ test: "AI Orchestrator", passed: false });
  }

  console.log("\n" + "═".repeat(60));
  console.log("  📊 SUMMARY");
  console.log("═".repeat(60));

  const allPassed = results.every((r) => r.passed);
  results.forEach((r) => {
    console.log(`  ${r.passed ? PASS : FAIL} ${r.test}`);
  });

  console.log(DIVIDER);
  console.log(allPassed
    ? `  ${PASS} ALL SYSTEMS OPERATIONAL`
    : `  ${FAIL} SOME SYSTEMS NEED ATTENTION`
  );
  console.log("═".repeat(60) + "\n");

  process.exit(allPassed ? 0 : 1);
}

main();
