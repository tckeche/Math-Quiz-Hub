# SOMA V3 - Architecture Audit: Assessment Data Flow

**Generated:** 2026-02-27
**Branch:** `claude/fix-empty-student-dashboard-64yiJ`
**Scope:** End-to-end lifecycle of an Assessment, from Tutor creation to Student visibility.

---

## 1. Database Relations (Foreign Key Map)

### Table: `soma_users`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | **PK** |
| `email` | `text` | NOT NULL |
| `display_name` | `text` | nullable |
| `role` | `text` | NOT NULL, default `"student"`. Values: `"student"`, `"tutor"`, `"super_admin"` |
| `created_at` | `timestamp` | NOT NULL, default `now()` |

### Table: `soma_quizzes`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | **PK** |
| `title` | `text` | NOT NULL |
| `topic` | `text` | NOT NULL |
| `syllabus` | `text` | default `"IEB"` |
| `level` | `text` | default `"Grade 6-12"` |
| `subject` | `text` | nullable |
| `curriculum_context` | `text` | nullable |
| `author_id` | `uuid` | **FK -> soma_users.id** (ON DELETE SET NULL) |
| `status` | `text` | NOT NULL, default `"published"` |
| `is_archived` | `boolean` | NOT NULL, default `false` |
| `created_at` | `timestamp` | NOT NULL, default `now()` |

### Table: `soma_questions`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | **PK** |
| `quiz_id` | `integer` | **FK -> soma_quizzes.id** (ON DELETE CASCADE) |
| `stem` | `text` | NOT NULL |
| `options` | `json` | NOT NULL (string array) |
| `correct_answer` | `text` | NOT NULL |
| `explanation` | `text` | NOT NULL |
| `marks` | `integer` | NOT NULL, default `1` |

### Table: `quiz_assignments`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | **PK** |
| `quiz_id` | `integer` | **FK -> soma_quizzes.id** (ON DELETE CASCADE) |
| `student_id` | `uuid` | **FK -> soma_users.id** (ON DELETE CASCADE) |
| `status` | `text` | NOT NULL, default `"pending"`. Values: `"pending"`, `"completed"` |
| `due_date` | `timestamp` | nullable |
| `created_at` | `timestamp` | NOT NULL, default `now()` |
| | | **UNIQUE INDEX** on `(quiz_id, student_id)` |

### Table: `tutor_students`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | **PK** |
| `tutor_id` | `uuid` | **FK -> soma_users.id** (ON DELETE CASCADE) |
| `student_id` | `uuid` | **FK -> soma_users.id** (ON DELETE CASCADE) |
| `created_at` | `timestamp` | NOT NULL, default `now()` |
| | | **UNIQUE INDEX** on `(tutor_id, student_id)` |

### Table: `soma_reports`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | **PK** |
| `quiz_id` | `integer` | **FK -> soma_quizzes.id** (ON DELETE CASCADE) |
| `student_id` | `uuid` | **FK -> soma_users.id** (ON DELETE SET NULL) |
| `student_name` | `text` | NOT NULL |
| `score` | `integer` | NOT NULL |
| `status` | `text` | NOT NULL, default `"pending"`. Values: `"pending"`, `"completed"`, `"failed"` |
| `ai_feedback_html` | `text` | nullable |
| `answers_json` | `jsonb` | nullable |
| `started_at` | `timestamp` | nullable |
| `completed_at` | `timestamp` | nullable |
| `created_at` | `timestamp` | NOT NULL, default `now()` |

### Foreign Key Relationship Diagram

```
soma_users (Tutor)
  |
  |-- tutor_students.tutor_id -----> soma_users (Student)
  |                                     |
  |-- soma_quizzes.author_id           |-- quiz_assignments.student_id
  |       |                            |-- soma_reports.student_id
  |       |-- soma_questions.quiz_id
  |       |-- quiz_assignments.quiz_id
  |       |-- soma_reports.quiz_id
```

**Critical join:** A quiz appears on the Student Dashboard ONLY when:
- A row exists in `quiz_assignments` where `quiz_id = soma_quizzes.id` AND `student_id = soma_users.id`
- That assignment row has `status = "pending"`
- The quiz itself has `status = "published"` AND `is_archived = false`

---

## 2. Tutor Assignment Pipeline

### Trigger
Tutor clicks **"Assign"** on a quiz card in `TutorAssessments.tsx`, selects students, optionally sets a due date, and clicks "Assign Students".

### Frontend Execution Path

**File:** `client/src/pages/TutorAssessments.tsx`

1. **User Action:** Click "Assign Students" button (line ~784)
2. **Mutation fires:** `assignMutation.mutate({ quizId, studentIds, dueDate })` (line ~320)
3. **HTTP Request:**
   ```
   POST /api/tutor/quizzes/:quizId/assign
   Headers: { "x-tutor-id": <userId>, "Content-Type": "application/json" }
   Body: { "studentIds": ["uuid1", "uuid2"], "dueDate": "2026-03-15T00:00:00.000Z" }
   ```
4. **On Success (line ~331):**
   - Close assign modal
   - Clear selected students
   - `queryClient.invalidateQueries({ queryKey: ["/api/tutor/quizzes", expandedQuiz, "assignments"] })`

### Backend Execution Path

**File:** `server/routes.ts`, lines 520-555

```
POST /api/tutor/quizzes/:quizId/assign
```

| Step | Code Location | Action |
|------|---------------|--------|
| 1 | Middleware `requireTutor` (line 153) | Reads `x-tutor-id` header, verifies user exists and has `role = "tutor"` or `"super_admin"` via `storage.getSomaUserById()`. Attaches `req.tutorId`. |
| 2 | Line 524 | Parses `quizId` from URL params |
| 3 | Line 524 | Sanitizes `studentIds` array (dedupes, trims, filters non-strings) |
| 4 | Line 526-528 | Parses optional `dueDate`, validates it's a valid Date |
| 5 | Line 533-535 | Fetches quiz from DB. Returns 404 if not found or archived. |
| 6 | **Line 538-542** | **FORCE-PUBLISH:** If `quiz.status !== "published"`, executes `storage.updateSomaQuiz(quizId, { status: "published" })`. Logs: `[Assign] Force-published quiz X (was "Y")` |
| 7 | Line 544-546 | Fetches tutor's adopted students. Filters `studentIds` to only those the tutor has adopted. Returns 400 if none are valid. |
| 8 | Line 550 | Calls `storage.createQuizAssignments(quizId, validIds, dueDate)` |

### Storage Layer: `createQuizAssignments`

**File:** `server/storage.ts`, lines 262-265 (DatabaseStorage)

```sql
INSERT INTO quiz_assignments (quiz_id, student_id, status, due_date)
VALUES ($1, $2, 'pending', $3)
ON CONFLICT DO NOTHING
RETURNING *;
```

- Uses `ON CONFLICT DO NOTHING` so re-assigning the same student is a no-op (unique index on `quiz_id + student_id`).
- Status is hardcoded to `"pending"`.
- Returns only newly created rows.

---

## 3. Student Visibility Rules

### The Exact Boolean Expression

A quiz renders on the Student Dashboard if **ALL** of the following are true:

```
quiz_assignments.student_id === currentUser.id    (row exists)
  AND quiz_assignments.status === "pending"        (not completed)
  AND soma_quizzes.status === "published"           (backend filter)
  AND soma_quizzes.is_archived === false            (backend filter)
```

**Frontend applies NO additional status filtering.** The `availableQuizzes` useMemo maps raw backend data directly to UI cards.

### End-to-End Data Flow

#### Step 1: Component Mount
**File:** `client/src/pages/StudentDashboard.tsx`, lines 97-161

1. `useEffect` calls `supabase.auth.getSession()` to get the Supabase session
2. Extracts `userId = session.user.id`
3. React Query fires two parallel queries:
   - `["/api/quizzes/available", userId]` -> `authFetch("/api/quizzes/available")`
   - `["/api/student/reports", userId]` -> `authFetch("/api/student/reports")`

#### Step 2: Authenticated Fetch
**File:** `client/src/lib/supabase.ts`, lines 25-34

`authFetch()` calls `supabase.auth.getSession()`, extracts `session.access_token`, and adds it as `Authorization: Bearer <token>`.

#### Step 3: Backend Authentication
**File:** `server/routes.ts`, line 1009

`GET /api/quizzes/available` uses the `requireSupabaseAuth` middleware (lines 221-247):
1. Extracts Bearer token from Authorization header
2. Verifies JWT using `SUPABASE_JWT_SECRET` (or falls back to Supabase `/auth/v1/user` API)
3. Looks up `soma_users` by the decoded `sub` claim
4. Attaches `req.authUser = { id, email, role }`

#### Step 4: Backend Data Assembly
**File:** `server/routes.ts`, lines 1009-1061

```javascript
const studentId = req.authUser.id;
const allQuizzes = await storage.getSomaQuizzes();                    // All quizzes in DB
const assignments = await storage.getQuizAssignmentsForStudent(studentId); // All assignments for this student
```

**Filter chain:**
1. Build `assignmentMap`: Only assignments where `status === "pending"` (Map<quizId, assignment>)
2. Filter `publishedQuizzes`: Only quizzes where `!isArchived && status === "published"`
3. Intersect: `publishedQuizzes.filter(q => assignmentMap.has(q.id))`
4. Map to response: Spread quiz fields + `isAssigned: true` + `assignmentStatus: "pending"` + `dueDate`

**Storage query for assignments** (`server/storage.ts`, lines 269-275):
```sql
SELECT quiz_assignments.*, soma_quizzes.*
FROM quiz_assignments
INNER JOIN soma_quizzes ON quiz_assignments.quiz_id = soma_quizzes.id
WHERE quiz_assignments.student_id = $1
```
This returns ALL assignments (pending + completed) with their joined quiz data. The backend route then filters to only `pending`.

#### Step 5: Frontend Rendering
**File:** `client/src/pages/StudentDashboard.tsx`, lines 199-210

```typescript
const availableQuizzes = useMemo(() => {
  // Backend already filters for published + pending assignments — no frontend filter needed
  return (somaQuizzes || [])
    .map((q: any) => ({
      id: q.id,
      title: q.title,
      subject: q.topic || q.subject || "General",
      level: q.level || "",
      isAssigned: q.isAssigned || false,
      dueDate: q.dueDate || null,
    }));
}, [somaQuizzes, completedSomaQuizIds]);
```

**Key:** No `.filter()` call. Every quiz returned by the backend is rendered. The backend is the single source of truth for visibility.

Subject/level filters (lines 224-230) are UI-only cosmetic filters applied AFTER the data is mapped.

#### Ghost Assignment Failure Modes

| # | Failure | Where It Breaks | Fix |
|---|---------|-----------------|-----|
| 1 | Quiz `status` is not `"published"` | Backend line 1030: `allQuizzes.filter(q => q.status === "published")` excludes it | Force-publish on assign (line 538-542) |
| 2 | Quiz `is_archived` is `true` | Backend line 1030: `!q.isArchived` excludes it | Manual DB fix or unarchive endpoint |
| 3 | Assignment `status` is not `"pending"` | Backend line 1024: `if (a.status === "pending")` excludes it | Student already completed, or status was set incorrectly |
| 4 | No `quiz_assignments` row exists | Backend line 1047: `assignmentMap.has(q.id)` is false | Assign route returned 400 (no valid students), or `ON CONFLICT DO NOTHING` suppressed a duplicate |
| 5 | Student `soma_users` row missing | `requireSupabaseAuth` returns 401 ("User not found") | `/api/auth/sync` never called after signup |
| 6 | Supabase token expired/invalid | `requireSupabaseAuth` returns 401 | Client needs to refresh session |

---

## 4. Diagnostic X-Ray Locations

### Backend Console Logs

All diagnostic logs are in `server/routes.ts` inside the `GET /api/quizzes/available` handler.

#### Log 1: Entry Point (line 1015)
```
[Available] Fetching for Student: <uuid>, Found Assignments: <N>
```
**What it tells you:** Confirms the route was reached and how many total assignment rows exist for this student. If `N = 0`, the student has never been assigned any quiz.

#### Log 2: Per-Assignment Detail (lines 1017-1020)
```
[Available]   Assignment quizId=<id> status="<status>" dueDate=<date|null> quizStatus="<status>" quizTitle="<title>"
```
**What it tells you:** For EACH assignment row in the DB, shows:
- `status`: If not `"pending"`, this assignment was already completed or marked otherwise
- `dueDate`: The due date (or null if none set)
- `quizStatus`: The status of the joined quiz. If not `"published"`, this is a ghost assignment
- `quizTitle`: Human-readable identifier

#### Log 3: Summary Counts (line 1032)
```
[Available] Student <uuid>: <N> total assignments, <M> pending, <P> published quizzes, <T> total quizzes
```
**What it tells you:** The filtration funnel. If `N > 0` but `M = 0`, all assignments are completed. If `M > 0` but the final output is 0, the quiz status or archived flag is filtering them out.

#### Log 4: Ghost Assignment Detector (lines 1034-1044)
```
[Available] WARNING: Assignment for quizId=<id> but quiz not found in DB!
[Available] WARNING: Assignment for quizId=<id> but quiz status="<status>" (not published) — title="<title>"
[Available] WARNING: Assignment for quizId=<id> but quiz is archived — title="<title>"
```
**What it tells you:** Pinpoints EXACTLY why a specific assignment is invisible. If any WARNING line appears, it identifies the precise ghost assignment and its root cause.

#### Log 5: Final Output (line 1055)
```
[Available] Returning <N> available quizzes for student <uuid>
```
**What it tells you:** The final count of quizzes sent to the frontend. If this is `0` despite pending assignments existing, check the WARNING logs above.

#### Log 6: Force-Publish on Assign (line 541)
```
[Assign] Force-published quiz <id> (was "<old_status>")
```
**What it tells you:** A quiz was not published at the time of assignment. The system auto-corrected it. If you never see this log, all quizzes are being created correctly with `status: "published"`.

### How to Use These Logs

**Scenario: Student reports empty dashboard after tutor assigns a quiz.**

1. Open terminal/server logs
2. Have the student refresh their dashboard (triggers `GET /api/quizzes/available`)
3. Search logs for `[Available] Fetching for Student:`
4. Check the student's UUID matches
5. Follow the decision tree:

```
Assignments = 0?
  -> No assignment row in DB. Check if assign route returned successfully.

Assignments > 0, but Pending = 0?
  -> All assignments are "completed". Student already submitted.

Pending > 0, but WARNING logs present?
  -> Ghost assignment. Read the WARNING to identify root cause.

Pending > 0, no WARNINGs, but Returning = 0?
  -> BUG: Logic error in the intersection filter. Escalate.

Returning > 0?
  -> Backend is sending data. Problem is in frontend or network.
  -> Check browser DevTools Network tab for the response payload.
```

---

## 5. Quiz Creation Entry Points

All paths now set `status: "published"` at creation time:

| Entry Point | Route | File:Line | Status |
|-------------|-------|-----------|--------|
| Tutor manual create | `POST /api/tutor/quizzes` | `routes.ts:726-733` | `"published"` |
| Tutor AI generate | `POST /api/tutor/quizzes/generate` | `routes.ts:1224-1234` | `"published"` |
| Admin AI generate | `POST /api/soma/generate` | `routes.ts:1166-1174` | `"published"` |
| Copilot chat -> auto-save | `POST /api/tutor/quizzes/:quizId/questions` | `routes.ts:776` | Quiz already exists; status unchanged |
| Schema default | `shared/schema.ts:23` | N/A | `default("published")` |

**Safety net:** Even if a quiz somehow enters the DB with a non-published status, the assign route (line 538-542) force-publishes it before creating assignment rows.

---

## 6. Assignment Lifecycle State Machine

```
[Quiz Created]  status="published"
       |
       v
[Tutor Assigns]  POST /api/tutor/quizzes/:id/assign
       |          -> Force-publish if needed
       |          -> INSERT quiz_assignments (status="pending")
       v
[Student Sees Quiz]  GET /api/quizzes/available
       |              -> Returns quiz if published + pending assignment
       v
[Student Submits]  POST /api/soma/quizzes/:id/submit
       |           -> Creates soma_report (status="pending")
       |           -> Calls updateQuizAssignmentStatus(quizId, studentId, "completed")
       |           -> Fires background AI grading
       v
[Assignment Completed]  quiz_assignments.status = "completed"
       |                 -> Quiz no longer appears in GET /api/quizzes/available
       v
[AI Grading Finishes]  soma_reports.status = "completed" | "failed"
       |                -> Student sees score + feedback in Completed section
       v
[Student Reviews]  GET /api/soma/reports/:id/review
```

---

## 7. Tutor Management Actions (God-Mode)

| Action | Route | Auth | Storage Method | Cascade |
|--------|-------|------|----------------|---------|
| Delete assessment | `DELETE /api/tutor/quizzes/:quizId` | `requireTutor` + `authorId` check | `deleteSomaQuiz()` | Deletes: questions, reports, assignments, then quiz |
| Extend deadline +24h | `PATCH /api/tutor/quizzes/:quizId/assignments/extend` | `requireTutor` + `authorId` check | `extendQuizAssignmentDeadlines()` | Updates `due_date` on all pending assignments |
| Delete question | `DELETE /api/tutor/questions/:questionId` | `requireTutor` | `deleteSomaQuestion()` | Single row delete |
| Unassign student | `DELETE /api/tutor/quizzes/:quizId/unassign/:studentId` | `requireTutor` + adopted check | `deleteQuizAssignment()` | Single row delete |

---

*End of Architecture Audit*
