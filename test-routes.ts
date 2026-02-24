import 'dotenv/config';

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const PASS = "✅";
const FAIL = "❌";
const INFO = "ℹ️";
const DIVIDER = "─".repeat(60);

async function safeFetch(url: string, options?: RequestInit) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, statusText: res.statusText, body: json || text, raw: text, ok: res.ok };
  } catch (e: any) {
    return { status: 0, statusText: "CONNECTION_FAILED", body: e.message, raw: e.message, ok: false };
  }
}

async function testServerHealth() {
  console.log("\n" + DIVIDER);
  console.log("  TEST 1: SERVER HEALTH");
  console.log(DIVIDER);

  const res = await safeFetch(`${BASE_URL}/api/quizzes`);
  console.log(`  GET /api/quizzes → HTTP ${res.status} ${res.statusText}`);

  if (res.status === 0) {
    console.log(`  ${FAIL} Server is NOT reachable at ${BASE_URL}`);
    console.log(`  ${INFO} Error: ${res.body}`);
    return false;
  }

  if (res.ok) {
    const count = Array.isArray(res.body) ? res.body.length : "unknown";
    console.log(`  ${PASS} Server is running and responding.`);
    console.log(`  ${INFO} Returned ${count} quiz(zes).`);
    return true;
  }

  console.log(`  ${FAIL} Unexpected response: ${res.raw.substring(0, 200)}`);
  return false;
}

async function testSecurityGate() {
  console.log("\n" + DIVIDER);
  console.log("  TEST 2: SECURITY GATE (NO AUTH TOKEN)");
  console.log(DIVIDER);

  let allSecured = true;

  const syncRes = await safeFetch(`${BASE_URL}/api/auth/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  console.log(`\n  POST /api/auth/sync (empty body, no token)`);
  console.log(`    HTTP ${syncRes.status} ${syncRes.statusText}`);
  console.log(`    Body: ${JSON.stringify(syncRes.body)}`);

  if (syncRes.status === 401 || syncRes.status === 403) {
    console.log(`    ${PASS} Route is SECURED — rejected unauthenticated request.`);
  } else if (syncRes.status === 400) {
    console.log(`    ⚠️  Route returned 400 (validation error, not an auth check).`);
    console.log(`    ${INFO} This means the route is OPEN — it checks payload format but not identity.`);
    allSecured = false;
  } else if (syncRes.status === 200) {
    console.log(`    ${FAIL} Route is UNSECURED — accepted request with no auth token!`);
    allSecured = false;
  } else if (syncRes.status === 404) {
    console.log(`    ${FAIL} Route NOT FOUND — /api/auth/sync may not be registered.`);
    allSecured = false;
  } else {
    console.log(`    ${INFO} Unexpected status. Investigate manually.`);
  }

  const somaRes = await safeFetch(`${BASE_URL}/api/soma/quizzes`);
  console.log(`\n  GET /api/soma/quizzes (no token)`);
  console.log(`    HTTP ${somaRes.status} ${somaRes.statusText}`);
  const somaPreview = typeof somaRes.body === "string" ? somaRes.body.substring(0, 150) : JSON.stringify(somaRes.body).substring(0, 150);
  console.log(`    Body: ${somaPreview}`);

  if (somaRes.status === 401 || somaRes.status === 403) {
    console.log(`    ${PASS} Route is SECURED — rejected unauthenticated request.`);
  } else if (somaRes.status === 200) {
    console.log(`    ⚠️  Route returned 200 OK with no auth token.`);
    console.log(`    ${INFO} This route is OPEN to unauthenticated access.`);
  } else if (somaRes.status === 404) {
    console.log(`    ${FAIL} Route NOT FOUND.`);
    allSecured = false;
  }

  const reportsRes = await safeFetch(`${BASE_URL}/api/student/reports?studentId=550e8400-e29b-41d4-a716-446655440000`);
  console.log(`\n  GET /api/student/reports (no token, arbitrary studentId)`);
  console.log(`    HTTP ${reportsRes.status} ${reportsRes.statusText}`);
  console.log(`    Body: ${JSON.stringify(reportsRes.body).substring(0, 150)}`);

  if (reportsRes.status === 401 || reportsRes.status === 403) {
    console.log(`    ${PASS} Route is SECURED.`);
  } else if (reportsRes.status === 200) {
    console.log(`    ⚠️  Route returned 200 OK — student data accessible without auth.`);
  }

  console.log(`\n  ${allSecured ? PASS + " All tested routes enforce authentication." : "⚠️  Some routes lack authentication middleware — see notes above."}`);
  return allSecured;
}

async function testSyncRouteFormat() {
  console.log("\n" + DIVIDER);
  console.log("  TEST 3: AUTH SYNC ROUTE — PAYLOAD FORMAT");
  console.log(DIVIDER);

  const mockUser = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    email: "diagnostic-test@example.com",
    user_metadata: {
      display_name: "Diagnostic User",
      full_name: "Diagnostic User",
    },
  };

  console.log(`  ${INFO} Sending mock user payload to /api/auth/sync`);
  console.log(`  ${INFO} Payload: ${JSON.stringify(mockUser, null, 2).split("\n").join("\n  ")}`);

  const res = await safeFetch(`${BASE_URL}/api/auth/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockUser),
  });

  console.log(`\n  HTTP ${res.status} ${res.statusText}`);
  console.log(`  Body: ${JSON.stringify(res.body, null, 2).split("\n").join("\n  ")}`);

  if (res.status === 200 || res.status === 201) {
    console.log(`\n  ${PASS} Sync route accepted the payload and upserted the user.`);
    console.log(`  ${INFO} Note: Route does NOT require a Supabase JWT — it's open.`);
    return true;
  } else if (res.status === 401 || res.status === 403) {
    console.log(`\n  ${FAIL} Sync route REQUIRES authentication.`);
    console.log(`  ${INFO} The backend is demanding an Authorization header with a valid Supabase JWT.`);
    console.log(`  ${INFO} Required header: Authorization: Bearer <supabase_access_token>`);
    return false;
  } else if (res.status === 400) {
    console.log(`\n  ⚠️  Sync route returned 400 — payload validation failed.`);
    console.log(`  ${INFO} The route expects a different payload format. Check the error message above.`);
    return false;
  } else if (res.status === 500) {
    console.log(`\n  ${FAIL} Sync route returned 500 — internal server error.`);
    console.log(`  ${INFO} Likely a database or schema mismatch. Check server logs.`);
    return false;
  } else {
    console.log(`\n  ${INFO} Unexpected status code. Investigate manually.`);
    return false;
  }
}

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  🔬 SOMA LIVE API & AUTH ROUTE DIAGNOSTIC");
  console.log("═".repeat(60));
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  const results: { test: string; passed: boolean }[] = [];

  try {
    const healthOk = await testServerHealth();
    results.push({ test: "Server Health", passed: healthOk });
    if (!healthOk) {
      console.log(`\n  ${FAIL} Server unreachable — skipping remaining tests.`);
      printSummary(results);
      return;
    }
  } catch (e: any) {
    console.log(`  ${FAIL} UNHANDLED: ${e.message}`);
    results.push({ test: "Server Health", passed: false });
    printSummary(results);
    return;
  }

  try {
    results.push({ test: "Security Gate", passed: await testSecurityGate() });
  } catch (e: any) {
    console.log(`  ${FAIL} UNHANDLED: ${e.message}`);
    results.push({ test: "Security Gate", passed: false });
  }

  try {
    results.push({ test: "Sync Route Format", passed: await testSyncRouteFormat() });
  } catch (e: any) {
    console.log(`  ${FAIL} UNHANDLED: ${e.message}`);
    results.push({ test: "Sync Route Format", passed: false });
  }

  printSummary(results);
}

function printSummary(results: { test: string; passed: boolean }[]) {
  console.log("\n" + "═".repeat(60));
  console.log("  📊 SUMMARY");
  console.log("═".repeat(60));

  results.forEach((r) => {
    console.log(`  ${r.passed ? PASS : FAIL} ${r.test}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log(DIVIDER);
  console.log(allPassed
    ? `  ${PASS} ALL ROUTE CHECKS PASSED`
    : `  ⚠️  SOME CHECKS NEED ATTENTION (see details above)`
  );
  console.log("═".repeat(60) + "\n");

  process.exit(allPassed ? 0 : 1);
}

main();
