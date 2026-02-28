# SOMA V3 - Assignment Authorization Audit

## Executive Summary

**The Data Leak:** The Student Dashboard displays TWO quiz lists merged together — the assignment-gated Soma quizzes AND the legacy quiz pool. The Soma quizzes correctly use `quiz_assignments` to scope visibility. However, the legacy `GET /api/quizzes` route returns ALL non-archived quizzes to any caller with zero auth. Both lists are combined and rendered on the student dashboard.

---

## Target 1: Schema Definitions

### `somaQuizzes` table (shared/schema.ts:78-90)

```ts
export const somaQuizzes = pgTable("soma_quizzes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  syllabus: text("syllabus").default("IEB"),
  level: text("level").default("Grade 6-12"),
  subject: text("subject"),
  curriculumContext: text("curriculum_context"),
  authorId: uuid("author_id").references(() => somaUsers.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### `quizAssignments` table (shared/schema.ts:123-131)

```ts
export const quizAssignments = pgTable("quiz_assignments", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => somaQuizzes.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => somaUsers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("quiz_assignment_unique_idx").on(table.quizId, table.studentId),
]);
```

---

## Target 2: Student Dashboard Fetch Routes

### What the frontend calls (client/src/pages/StudentDashboard.tsx:168-182)

The Student Dashboard makes **TWO separate fetches**:

```ts
// FETCH 1: Legacy quizzes — NO AUTH, returns ALL quizzes globally
const { data: quizzes, isLoading: quizzesLoading } = useQuery<Quiz[]>({
  queryKey: ["/api/quizzes"],
});

// FETCH 2: Soma quizzes — AUTH via JWT, scoped by quiz_assignments
const { data: somaQuizzes, isLoading: somaLoading } = useQuery<SomaQuiz[]>({
  queryKey: ["/api/quizzes/available", userId],
  queryFn: async () => {
    if (!userId) return [];
    const res = await authFetch("/api/quizzes/available");
    if (!res.ok) return [];
    return res.json();
  },
  enabled: !!userId,
});
```

They are then **combined** into a single list (StudentDashboard.tsx:247-282):

```ts
const availableQuizzes = useMemo(() => {
  const regularAvailable = (quizzes || [])           // <-- ALL legacy quizzes, unfiltered
    .filter((q) => !completedQuizIds.has(q.id))
    .map((q) => ({ id: q.id, title: q.title, ... type: "regular" as const }));

  const somaAvailable = (somaQuizzes || [])           // <-- Only assigned soma quizzes
    .filter((q) => q.status === "published" && !completedSomaQuizIds.has(q.id))
    .map((q) => ({ id: q.id, title: q.title, ... type: "soma" as const }));

  return [...regularAvailable, ...somaAvailable].sort(...);
}, [quizzes, somaQuizzes, completedQuizIds, completedSomaQuizIds]);
```

### Backend: `GET /api/quizzes` (server/routes.ts:855-858) — THE LEAK

```ts
app.get("/api/quizzes", async (_req, res) => {
  const allQuizzes = await storage.getQuizzes();
  res.json(allQuizzes.filter((q) => !q.isArchived));
});
```

**No authentication. No assignment check. Returns the entire legacy quiz pool.**

### Backend: `GET /api/quizzes/available` (server/routes.ts:685-699) — CORRECT

```ts
app.get("/api/quizzes/available", requireSupabaseAuth, async (req, res) => {
  try {
    const studentId = (req as any).authUser.id;
    const assignments = await storage.getQuizAssignmentsForStudent(studentId);
    const unique = new Map<number, (typeof assignments)[number]["quiz"]>();
    for (const assignment of assignments) {
      const quiz = assignment.quiz;
      if (quiz.isArchived || quiz.status !== "published") continue;
      unique.set(quiz.id, quiz);
    }
    res.json(Array.from(unique.values()));
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch available quizzes" });
  }
});
```

**This route IS correctly gated**: requires Supabase JWT, looks up `quiz_assignments` for the student, returns only assigned+published+non-archived quizzes.

---

## Target 3: Storage Query Methods

### `getQuizAssignmentsForStudent` (server/storage.ts:424-431) — CORRECT

```ts
async getQuizAssignmentsForStudent(studentId: string): Promise<(QuizAssignment & { quiz: SomaQuiz })[]> {
  const rows = await this.database
    .select({ assignment: quizAssignments, quiz: somaQuizzes })
    .from(quizAssignments)
    .innerJoin(somaQuizzes, eq(quizAssignments.quizId, somaQuizzes.id))
    .where(eq(quizAssignments.studentId, studentId));
  return rows.map((r) => ({ ...r.assignment, quiz: r.quiz }));
}
```

### `getQuizzes` — used by `GET /api/quizzes` (legacy, the leaking route)

This returns ALL quizzes from the `quizzes` table (the legacy table, not `soma_quizzes`). No student filtering.

---

## Target 4: Tutor Assignment Logic

### Route: `POST /api/tutor/quizzes/:quizId/assign` (server/routes.ts:494-519)

```ts
app.post("/api/tutor/quizzes/:quizId/assign", requireTutor, async (req, res) => {
  try {
    const tutorId = (req as any).tutorId;
    const quizId = parseInt(String(req.params.quizId));
    const studentIds = sanitizeStudentIds(req.body?.studentIds);
    if (studentIds.length === 0) {
      return res.status(400).json({ message: "studentIds array required" });
    }
    // Verify quiz belongs to this tutor
    const quiz = await storage.getSomaQuiz(quizId);
    if (!quiz || quiz.authorId !== tutorId) {
      return res.status(403).json({ message: "You can only assign your own quizzes" });
    }
    // Verify all students are adopted by this tutor
    const adopted = await storage.getAdoptedStudents(tutorId);
    const adoptedIds = new Set(adopted.map((s) => s.id));
    const validIds = studentIds.filter((id: string) => adoptedIds.has(id));
    if (validIds.length === 0) {
      return res.status(400).json({ message: "None of the provided students are adopted by you" });
    }
    const assignments = await storage.createQuizAssignments(quizId, validIds);
    res.json({ assigned: assignments.length, assignments });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to assign quiz" });
  }
});
```

### Storage: `createQuizAssignments` (server/storage.ts:418-422)

```ts
async createQuizAssignments(quizId: number, studentIds: string[]): Promise<QuizAssignment[]> {
  if (studentIds.length === 0) return [];
  const values = studentIds.map((studentId) => ({ quizId, studentId, status: "pending" }));
  return this.database.insert(quizAssignments).values(values).onConflictDoNothing().returning();
}
```

**This is correctly writing to the database.** Assignments are created with proper FK references and unique constraint handling.

### Submission route also validates assignment (server/routes.ts:1512-1516)

```ts
const assignments = await storage.getQuizAssignmentsForStudent(studentId);
const hasAssignment = assignments.some((assignment) => assignment.quizId === quizId);
if (!hasAssignment) {
  return res.status(403).json({ message: "Quiz is not assigned to this student" });
}
```

---

## Root Cause Diagnosis

| Component | Status | Issue |
|-----------|--------|-------|
| `quiz_assignments` schema | OK | Properly defines FK relationships with unique constraint |
| `GET /api/quizzes/available` | OK | Correctly uses `getQuizAssignmentsForStudent()` to scope |
| `getQuizAssignmentsForStudent()` | OK | Properly JOINs `quiz_assignments` with `soma_quizzes` |
| `POST /api/tutor/quizzes/:quizId/assign` | OK | Correctly writes to `quiz_assignments` |
| `createQuizAssignments()` | OK | Correct INSERT with conflict handling |
| `GET /api/quizzes` | **LEAK** | Returns ALL legacy quizzes, no auth, no assignment check |
| Student Dashboard frontend | **LEAK** | Fetches from both `/api/quizzes` AND `/api/quizzes/available`, merges them |

**The fix requires:** Either (a) removing the `GET /api/quizzes` fetch from the Student Dashboard, or (b) adding assignment-based filtering to `GET /api/quizzes`, or (c) migrating all legacy quizzes into the Soma system and dropping the legacy fetch entirely.
