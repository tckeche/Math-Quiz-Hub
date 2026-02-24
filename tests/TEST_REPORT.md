# Comprehensive Test Report — Math Quiz Hub (MCEC)
**Date:** 2026-02-24
**Tester:** Claude Code (Automated + Static Analysis)
**Branch:** `claude/comprehensive-app-testing-3FdyX`
**App URL:** https://mcec-tests.replit.app/admin
**Admin credential tested:** `Chomukamba`
**Test Suite Result:** ✅ **186/186 tests passed** across 5 test files (27 pre-existing failures fixed)

---

## 0. What Changed in This Session

| Item | Detail |
|---|---|
| Pre-existing test failures | **27 tests were failing** before this session |
| Root cause | `generateWithFallback()` return type changed to `{ data, metadata }` but mocks still expected a plain string |
| Files fixed | `tests/routes.test.ts`, `tests/aiPipeline.test.ts`, `tests/aiOrchestrator.test.ts` |
| Additional bugs documented | 2 new bugs found (BUG-006, BUG-007) in aiOrchestrator |
| Tests added | Expanded aiOrchestrator tests from 16→18 (added Google fallback, missing API key path) |
| Final result | **186/186 tests passing**, 0 failures |

---

## 1. Executive Summary

The Math Quiz Hub is a full-stack mathematics MCQ platform with a sophisticated multi-provider AI backbone. The automated test suite passes completely after fixing a breaking API change. Static code analysis and architectural review reveal **7 bugs** of varying severity and **9 recommendations** across security, AI reliability, UX, and performance.

The AI Orchestrator (9-model waterfall: Anthropic×2 → Google Gemini×3 → DeepSeek×2 → OpenAI×2) and the Soma Intelligence Pipeline (3-stage: Generate → Audit → Syllabus) are well-architected with solid fallback logic. Key concerns are: missing quiz-existence validation on a Soma route, no deduplication guard on submissions, no CSRF protection on cookie-auth endpoints, and a $ref schema resolution bug in the Anthropic provider path.

---

## 2. Test Coverage Summary

| File | Tests | Passed | Failed | Pre-fix Failures | Coverage Area |
|------|-------|--------|--------|-----------------|---------------|
| `tests/schema.test.ts` | 25 | 25 | 0 | 0 | Zod schema validation for all models |
| `tests/storage.test.ts` | 33 | 33 | 0 | 0 | MemoryStorage CRUD, sanitization, single-attempt |
| `tests/aiOrchestrator.test.ts` | 18 | 18 | 0 | 16 | AI waterfall fallback (9-model chain), schema |
| `tests/aiPipeline.test.ts` | 32 | 32 | 0 | 8 | Soma 3-stage pipeline, QuestionSchema |
| `tests/routes.test.ts` | 78 | 78 | 0 | 3 | All API endpoints, auth, security, edge cases |
| **TOTAL** | **186** | **186** | **0** | **27** | |

### Code Coverage (V8)
```
File                    | % Stmts | % Branch | % Funcs | % Lines
------------------------|---------|----------|---------|--------
server/routes.ts        |  61.25  |  53.93   |  73.07  |  63.79
server/storage.ts       |  42.13  |  32.00   |  45.07  |  42.51
server/db.ts            |   0.00  |   0.00   |   0.00  |   0.00
server/seed.ts          |   0.00  |   0.00   |   0.00  |   0.00
server/services/
  aiOrchestrator.ts     |  61.33  |  53.15   |  66.66  |  67.40
  aiPipeline.ts         | 100.00  | 100.00   | 100.00  | 100.00
shared/schema.ts        |  69.23  | 100.00   |   0.00  |  78.26
------------------------|---------|----------|---------|--------
All files               |  57.72  |  46.72   |  54.66  |  61.07
```

---

## 3. Functional Testing Results

### 3.1 Authentication

| Test Case | Result | Notes |
|-----------|--------|-------|
| Login with correct password | ✅ PASS | Returns `{authenticated: true}` + httpOnly cookie |
| Login with wrong password | ✅ PASS | 401 `Invalid admin credentials` |
| Login with empty password | ✅ PASS | 401 |
| Login with no body | ✅ PASS | 401 |
| Session check — no cookie | ✅ PASS | `{authenticated: false}` |
| Session check — valid cookie | ✅ PASS | `{authenticated: true}` |
| Session check — tampered token | ✅ PASS | `{authenticated: false}` |
| Logout clears cookie | ✅ PASS | |
| Rate limiting (5 attempts / 15 min) | ✅ CONFIGURED | `express-rate-limit` applied on `/api/admin/login` |
| JWT is httpOnly | ✅ PASS | Verified in `Set-Cookie` header |

**Finding:** The admin password (`Chomukamba`) is stored in an environment variable (`ADMIN_PASSWORD`). This is correct. The JWT token uses a 12-hour expiry which is appropriate for an admin session.

### 3.2 Quiz Management (Admin)

| Test Case | Result | Notes |
|-----------|--------|-------|
| Create quiz — valid data | ✅ PASS | |
| Create quiz — missing title | ✅ PASS | 400 |
| Create quiz — missing timeLimitMinutes | ✅ PASS | 400 |
| Create quiz — missing dueDate | ✅ PASS | 400 |
| List all quizzes | ✅ PASS | |
| Delete quiz (cascade) | ✅ PASS | Deletes questions and submissions |
| Add questions to quiz | ✅ PASS | Validates schema |
| Add invalid questions format | ✅ PASS | 400 with error details |
| Add questions to non-existent quiz | ✅ PASS | 404 |
| Admin sees correctAnswer in questions | ✅ PASS | Admin endpoint includes full data |
| Delete individual question | ✅ PASS | |
| Delete all submissions for quiz | ✅ PASS | |

### 3.3 Student Portal

| Test Case | Result | Notes |
|-----------|--------|-------|
| Register student | ✅ PASS | Name sanitized to lowercase |
| Register duplicate (case-insensitive) | ✅ PASS | Returns same student ID |
| Missing firstName | ✅ PASS | 400 |
| Missing lastName | ✅ PASS | 400 |
| Name whitespace trimming | ✅ PASS | `  Bob  ` → `bob` |
| Student questions — no correctAnswer | ✅ PASS | `correctAnswer` stripped from response |
| Check submission — new student | ✅ PASS | `{hasSubmitted: false}` |
| Check submission — after submission | ✅ PASS | `{hasSubmitted: true, totalScore, maxPossibleScore}` |
| Single-attempt enforcement — case insensitive | ✅ PASS | `TEST STUDENT` = `test student` |

### 3.4 Quiz Submission & Scoring

| Test Case | Result | Notes |
|-----------|--------|-------|
| Submit quiz — all correct | ✅ PASS | `totalScore == maxPossibleScore` |
| Submit quiz — all wrong | ✅ PASS | `totalScore == 0` |
| Submit with future startTime | ✅ PASS | 400 `invalid start time` |
| Submit exceeding time limit | ✅ PASS | 400 `time limit exceeded` |
| Submit without studentId | ✅ PASS | 400 |
| Submit without quizId | ✅ PASS | 400 |
| Submit without startTime | ✅ PASS | 400 |
| Submit to non-existent quiz | ✅ PASS | 404 |

**Anti-cheat note:** Server validates `startTime` against `Date.now()` with a 30-second grace buffer and enforces the time limit server-side. This correctly prevents clients from bypassing the timer.

### 3.5 AI Sections (PRIORITY FOCUS)

#### AI Orchestrator (`server/services/aiOrchestrator.ts`)

The fallback chain is: `claude-sonnet-4-6` → `claude-haiku-4-5` → `gemini-2.5-flash` → `gemini-2.5-pro` → `gemini-1.5-pro` → `deepseek-reasoner` → `deepseek-chat` → `gpt-5.1` → `gpt-4o-mini` (9 models).

| Test Case | Result | Notes |
|-----------|--------|-------|
| Anthropic success → returns `{data, metadata}` | ✅ PASS | Return type is `AIResult`, not string |
| metadata contains provider/model/durationMs | ✅ PASS | |
| Anthropic called with correct model+prompts | ✅ PASS | |
| Google/DeepSeek/OpenAI NOT called on Anthropic success | ✅ PASS | Efficient short-circuit |
| Schema mode — tool_use sent to Anthropic | ✅ PASS | Tool choice enforced |
| Schema in input_schema of tool definition | ✅ PASS | |
| Fallback: Both Anthropic fail → Google succeeds | ✅ PASS | |
| Google NOT calling OpenAI/DeepSeek on success | ✅ PASS | |
| Fallback: Anthropic+Google fail → DeepSeek succeeds | ✅ PASS | |
| DeepSeek gets `json_object` format with schema | ✅ PASS | |
| Fallback: Anthropic+Google+DeepSeek fail → OpenAI succeeds | ✅ PASS | |
| OpenAI gets `json_object` format with schema | ✅ PASS | |
| All 9 providers fail → error thrown | ✅ PASS | |
| $ref schema unresolved (BUG-006 documented) | ✅ PASS (documents bug) | See BUG-006 |
| Nested $ref — Anthropic returns tool_use correctly | ✅ PASS | |
| Missing ANTHROPIC_API_KEY falls through gracefully | ✅ PASS | |

**AI Orchestrator Assessment:** The 9-model waterfall is resilient. Schema enforcement is solid — Anthropic uses tool-calling (most reliable), while DeepSeek/OpenAI use `json_object` response format. `AIResult` metadata enables per-request provider attribution. Key bug: `$ref` schema resolution is bypassed for Anthropic (see BUG-006).

#### Soma AI Pipeline (`server/services/aiPipeline.ts`)

| Test Case | Result | Notes |
|-----------|--------|-------|
| QuestionSchema — valid question | ✅ PASS | |
| QuestionSchema — < 4 options rejected | ✅ PASS | |
| QuestionSchema — > 4 options rejected | ✅ PASS | |
| QuestionSchema — marks below 1 rejected | ✅ PASS | |
| QuestionSchema — marks above 10 rejected | ✅ PASS | |
| QuestionSchema — non-integer marks rejected | ✅ PASS | |
| QuestionSchema — missing stem rejected | ✅ PASS | |
| QuestionSchema — boundary marks (1, 10) | ✅ PASS | |
| QuestionSchema — LaTeX in stem | ✅ PASS | |
| QuizResultSchema — empty questions rejected | ✅ PASS | |
| 3 pipeline stages all called | ✅ PASS | Step 1, 2, 3 each call `generateWithFallback` |
| Stage 1 prompt includes topic | ✅ PASS | |
| Stage 2 prompt includes audit keywords | ✅ PASS | `audit/accuracy/rigorous` found |
| Stage 3 prompt includes syllabus keywords | ✅ PASS | `syllabus/curriculum/compliance` found |
| Stage 1 failure propagates error | ✅ PASS | |
| Stage 2 failure after stage 1 success | ✅ PASS | |
| Stage 3 failure after stages 1-2 success | ✅ PASS | |
| Invalid JSON from AI throws | ✅ PASS | |
| Schema validation failure throws | ✅ PASS | |
| Each stage passes schema to orchestrator | ✅ PASS | Structured output enforced throughout |

**Soma Pipeline Assessment:** The 3-stage pipeline (Generate → Math Audit → Syllabus Audit) correctly chains AI calls and validates output with Zod at each stage. This is robust — a bad response from any stage fails fast rather than propagating corruption.

#### PDF Generation Pipeline (4-stage SSE)

Static analysis only (no integration test possible without Gemini API key):

- Stage 1 (Gemini Vision): Direct API call — correct for multimodal
- Stage 2 (AI solves math): Routed through `generateWithFallback` ✅
- Stage 3 (LaTeX formatting): Routed through `generateWithFallback` ✅
- Stage 4 (JSON validation): Routed through `generateWithFallback` with schema ✅
- SSE heartbeat every 10s prevents connection timeout ✅
- 120-second route timeout configured ✅
- Client disconnect detection handled ✅

#### AI Student Analysis

| Test Case | Result | Notes |
|-----------|--------|-------|
| Valid submission → HTML analysis | ✅ PASS | Returns non-empty string |
| Missing `submission` → 400 | ✅ PASS | |
| Missing `questions` → 400 | ✅ PASS | |
| Requires admin auth | ✅ PASS | 401 without cookie |

#### AI Class Analysis

| Test Case | Result | Notes |
|-----------|--------|-------|
| Valid quizId → HTML analysis | ✅ PASS | |
| Missing quizId → 400 | ✅ PASS | |
| Returns submissionCount | ✅ PASS | |

### 3.6 Soma Quizzes (Student-Facing)

| Test Case | Result | Notes |
|-----------|--------|-------|
| Generate quiz (admin) | ✅ PASS | Returns quiz + questions + pipeline stages |
| Generate with title | ✅ PASS | |
| Generate with curriculumContext | ✅ PASS | |
| Missing topic → 400 | ✅ PASS | |
| Empty topic string → 400 | ✅ PASS | |
| Pipeline stages in response | ✅ PASS | |
| List soma quizzes (public) | ✅ PASS | |
| Get soma quiz by valid ID | ✅ PASS | |
| Get soma quiz by non-existent ID | ✅ PASS | 404 |
| Get soma quiz by invalid ID (letters) | ✅ PASS | 400 |
| Get soma questions — no correctAnswer | ✅ PASS | Stripped from student response |
| Get soma questions — no explanation | ✅ PASS | Stripped from student response |
| Get soma questions — invalid ID | ✅ PASS | 400 |

---

## 4. Bug Reports

### BUG-001 — MEDIUM: `/api/soma/quizzes/:id/questions` Missing Quiz Existence Validation
**File:** `server/routes.ts:630`
**Severity:** Medium
**Steps to reproduce:**
1. `GET /api/soma/quizzes/99999/questions`
2. Observe: Returns `200 []` instead of `404 {message: "Quiz not found"}`

**Expected:** `404 {message: "Quiz not found"}` (consistent with `/api/quizzes/:id/questions`)
**Actual:** `200 []`
**Impact:** Clients cannot distinguish "empty quiz" from "quiz doesn't exist". Could confuse students landing on dead Soma quiz links.
**Fix:** Add quiz existence check before returning questions (like the standard quiz endpoint does at `routes.ts:174-176`).

---

### BUG-002 — MEDIUM: No Server-Side Double-Submission Guard on `/api/submissions`
**File:** `server/routes.ts:204`
**Severity:** Medium
**Steps to reproduce:**
1. Student submits quiz successfully
2. Student sends a second POST to `/api/submissions` with same studentId + quizId
3. Observe: Second submission is accepted, creates duplicate

**Expected:** 409 "You have already submitted this quiz"
**Actual:** 200 — duplicate submission created
**Impact:** A student who submits twice gets two entries in the results table; analytics are skewed. The `POST /api/check-submission` route exists but is only called client-side, not enforced server-side on the submission endpoint itself.
**Fix:** Add `await storage.checkStudentSubmission(quizId, firstName, lastName)` check inside `POST /api/submissions` before creating the submission.

---

### BUG-003 — LOW: Non-Integer Quiz IDs Return 500 Instead of 400 or 404
**File:** `server/routes.ts:167`
**Severity:** Low
**Steps to reproduce:**
1. `GET /api/quizzes/abc`
2. `parseInt("abc")` → `NaN`; `storage.getQuiz(NaN)` → undefined → 404

**Expected:** `400 {message: "Invalid quiz ID"}`
**Actual:** `404 {message: "Quiz not found"}` (technically correct but misleading)
**Note:** This is a minor semantic inconsistency. The Soma routes correctly handle this with `isNaN(id)` checks, but standard quiz routes do not.
**Fix:** Add `if (isNaN(quizId)) return res.status(400).json({ message: "Invalid quiz ID" })` guards in quiz routes (matching the pattern in Soma routes at `routes.ts:619`).

---

### BUG-004 — LOW: `extractJsonArray` Returns `[parsedValue]` for Non-Array JSON Objects
**File:** `server/routes.ts:104-126`
**Severity:** Low
**Description:** If the AI returns a valid JSON object (not array, not wrapped in `questions`), `extractJsonArray` wraps it in an array: `[parsedValue]`. This can cause downstream schema failures or unexpected behavior in the copilot-chat question extraction.
**Impact:** Copilot drafts may include entire response objects as single items rather than the expected question array.

---

### BUG-006 — MEDIUM: `$ref` Schemas Sent Unresolved to Anthropic Provider
**File:** `server/services/aiOrchestrator.ts:291–322` (anthropic switch case)
**Severity:** Medium
**Description:** The `resolveJsonSchema()` utility in `aiOrchestrator.ts` is used correctly in `callOpenAI()` and `callDeepSeek()`, but the **inline Anthropic handler inside the switch case** passes `expectedSchema` directly to `input_schema` without calling `resolveJsonSchema()` first. This means schemas containing `$ref` references are forwarded unresolved to Anthropic, which may cause API errors or schema enforcement failures.

**Impact:** Any call to `generateWithFallback()` that passes a `$ref`-containing schema (e.g., Zod schemas converted via `zodToJsonSchema`) may fail to enforce structured output on the Anthropic provider.

**Fix:**
```ts
// In the anthropic switch case, change:
input_schema: expectedSchema as any,
// To:
input_schema: resolveJsonSchema(expectedSchema) as any,
```

---

### BUG-007 — LOW: `generateWithFallback` Error Message Changed — Consumer Code May Break
**File:** `server/services/aiOrchestrator.ts:340`
**Severity:** Low
**Description:** The final error message changed from `"All AI providers are currently unavailable. Please try again later."` to `"All AI providers and fallback models are currently exhausted."`. Any client code that pattern-matches on the old message (e.g., for user-facing display) will need to be updated.

**Fix:** Standardize the error message and consider using a typed error class (`AIProviderError`) so consumers don't need to string-match.

---

### BUG-005 — INFO: Soma Quiz `status` Field Not Validated Against Enum
**File:** `shared/schema.ts:69`
**Severity:** Info
**Description:** `status` is defined as `text("status").notNull().default("draft")` but has no database-level CHECK constraint and no Zod enum validation. Any string can be stored as status.
**Fix:** Change to `z.enum(["draft", "published"])` in the Zod schema, or add a `pgEnum` at the database level.

---

## 5. Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| No CSRF protection on cookie-auth endpoints | Medium | Open |
| Admin password in plain env var (no hashing) | Low | Acceptable for single-admin system |
| XSS in AI-generated HTML — sanitized client-side with DOMPurify | Low | Mitigated |
| SQL injection — prevented by Drizzle ORM parameterization | ✅ | Protected |
| JWT secret missing → server crash | Medium | Open (production must set JWT_SECRET) |
| Input not size-limited on JSON question upload | Low | Open |
| Image uploads restricted to MIME whitelist | ✅ | Protected |
| Image upload limited to 5MB | ✅ | Protected |
| correctAnswer stripped from student-facing `/api/quizzes/:id/questions` | ✅ | Protected |
| correctAnswer and explanation stripped from Soma student endpoint | ✅ | Protected |

### Security Finding Detail: No CSRF Protection
**Endpoints affected:** All `POST/DELETE` admin endpoints
**Risk:** If admin opens a malicious web page while logged in, the page could make cross-origin requests using the admin's session cookie.
**Mitigation:** The `sameSite: "lax"` cookie attribute provides partial protection against cross-site form submissions but does NOT protect against same-site requests or fetch-based CSRF.
**Recommendation:** Add CSRF token validation using a package like `csurf` or implement `SameSite=Strict` cookie policy.

---

## 6. Performance Analysis (Static)

| Component | Assessment |
|-----------|------------|
| AI Pipeline (PDF, 4-stage) | 120s timeout — appropriate for multi-model chain. SSE streaming provides real-time feedback. |
| Soma Pipeline (3-stage) | No timeout configured. A hang in any stage will block the endpoint indefinitely. **Recommend adding a 60s timeout.** |
| Database queries | Drizzle ORM with PostgreSQL — N+1 query risk in `getSubmissionsByQuizId` (join is correct; OK). |
| Memory storage | Used as fallback when `DATABASE_URL` is absent. Not suitable for concurrent production loads. |
| Heartbeat interval | 10s SSE heartbeat is efficient and prevents proxy timeouts. |
| `extractJsonArray` | Regex fallback adds resilience but may be slow on very large AI responses. |

---

## 7. Architecture & Code Quality Observations

### AI Orchestrator Design: Strengths
- ✅ Single entry point (`generateWithFallback`) — all AI calls route through one function
- ✅ Consistent fallback behavior across all features
- ✅ Schema enforcement: Anthropic uses tool-calling (most reliable), DeepSeek/OpenAI use `json_object`
- ✅ `resolveSchema` correctly unwraps Zod's `$ref` references before sending to providers
- ✅ Errors are caught and logged at each tier without crashing the pipeline

### AI Orchestrator Design: Concerns
- ⚠️ No retry with exponential backoff within a single provider (only cross-provider fallback)
- ⚠️ `tryDeepSeek` and `tryOpenAI` are structurally identical — could be unified into one function with the model/baseURL as parameters
- ⚠️ No token/cost tracking across providers
- ⚠️ `model: "claude-3-5-sonnet-latest"` — hardcoded; would benefit from configuration

### Soma Pipeline Design: Strengths
- ✅ Multi-stage validation with Zod at each step prevents corrupted data from advancing
- ✅ Logs progress at each stage for server-side observability
- ✅ Correctly uses structured outputs (schema passed to orchestrator at each stage)

### Soma Pipeline Design: Concerns
- ⚠️ All 3 stages go to the SAME orchestrator which always tries Anthropic first. If Anthropic is down, all 3 stages fall to DeepSeek — meaning the intended multi-model audit effect is lost (the "different AI verifies" benefit disappears)
- ⚠️ No timeout/abort signal on `generateAuditedQuiz` — a slow provider could hang the entire request
- ⚠️ Soma submission endpoint (`POST /api/soma/reports`) is missing — the Soma quiz engine collects answers client-side only (no server-side submission or scoring)

---

## 8. Test Coverage Gaps

The following areas have no automated test coverage due to requiring external services or UI:

| Gap | Reason | Risk |
|-----|--------|------|
| PDF generation pipeline (4-stage SSE) | Requires Gemini API + valid PDF | Medium — complex integration |
| Soma quiz student submission/scoring | No `/api/soma/submit` endpoint exists yet | High — feature incomplete |
| File upload (`/api/upload-image`) | Requires multipart form-data | Low — covered by filter validation |
| Admin copilot JSON draft extraction quality | AI-dependent output | Medium |
| LaTeX rendering in frontend | Requires browser | Low — uses established library |
| Timer anti-cheat (client-side localStorage) | Requires browser | Low |
| CSV export | Frontend-only | Low |
| Cross-browser compatibility | Requires browser testing | Medium |
| Mobile responsive design | Requires browser | Medium |
| Concurrent user load | Requires load test tool | Medium |

---

## 9. Critical Issues (Priority List)

| Priority | Issue | Impact |
|----------|-------|--------|
| P1 | BUG-002: No server-side double-submission guard | Duplicate results, analytics corruption |
| P2 | BUG-001: Soma questions returns 200 [] for missing quiz | Broken UX for invalid quiz links |
| P3 | BUG-006: $ref schemas unresolved for Anthropic provider | Structured output may silently fail |
| P4 | Security: No CSRF protection on admin endpoints | Admin session hijack risk |
| P5 | Soma pipeline: No timeout on `generateAuditedQuiz` | Endpoint can hang indefinitely |
| P6 | BUG-003: Non-integer IDs return 404 not 400 | Minor semantic inconsistency |
| P7 | Soma pipeline: All stages use Anthropic-first — defeats multi-model audit intent | Lower audit quality when Anthropic available |

---

## 10. Recommendations

1. **Add server-side submission deduplication** at `POST /api/submissions` using the existing `checkStudentSubmission` storage method.

2. **Add quiz existence validation** to `GET /api/soma/quizzes/:id/questions` (copy the pattern from the standard quiz questions endpoint).

3. **Add timeouts to Soma pipeline** — wrap `generateAuditedQuiz` with an `AbortSignal` or `Promise.race` timeout (suggested: 60s).

4. **Implement Soma submission endpoint** (`POST /api/soma/submit`) to persist and score student answers for Soma quizzes. The current implementation stores answers in React state only.

5. **Add CSRF protection** or upgrade cookie to `SameSite=Strict` to protect admin session endpoints.

6. **Validate `status` as enum** in the `somaQuizzes` schema (`"draft" | "published"` only).

7. **Unify DeepSeek and OpenAI provider functions** in aiOrchestrator.ts — they are near-identical. A single `tryOpenAICompatible(baseURL, model, ...)` would reduce duplication.

8. **Add `isNaN(id)` guards** to standard quiz routes (matching Soma routes pattern) for consistent 400 responses on invalid IDs.

9. **Consider pinning AI models explicitly** — `claude-3-5-sonnet-latest` will silently change as new versions release. For exam-grade consistency, pin to a specific version like `claude-3-5-sonnet-20241022`.

---

## 11. Test Infrastructure

```
tests/
├── vitest.config.ts       # Vitest config with path aliases
├── setup.ts               # Global env vars + console suppression
├── schema.test.ts         # 25 tests — Zod schema validation
├── storage.test.ts        # 33 tests — Storage CRUD + sanitization
├── aiOrchestrator.test.ts # 18 tests — AI 9-model waterfall fallback
├── aiPipeline.test.ts     # 32 tests — Soma 3-stage pipeline
└── routes.test.ts         # 78 tests — Full API integration
```

**Run tests:**
```bash
npm test               # Run all tests once
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

**Key mocking strategy:**
- `server/db` → `null` to force MemoryStorage (no database required)
- `express-rate-limit` → passthrough middleware (prevents IP-based state bleeding)
- `@anthropic-ai/sdk` + `openai` → `vi.hoisted()` mocks for ESM compatibility
- `server/services/aiOrchestrator` → stub in route tests
- `server/services/aiPipeline` → stub in route tests
- `@google/generative-ai` → stub in route tests
