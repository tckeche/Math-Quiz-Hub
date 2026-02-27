# SOMA V3 — Critical Data Leak & Assignment Audit

**Issue**: Newly registered students are seeing the global pool of quizzes on their dashboard instead of ONLY the ones explicitly assigned to them.

---

## Target 1: Schema Definitions

### `somaQuizzes` Table
```typescript
// File: shared/schema.ts (lines 78-90)
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

### `quizAssignments` Table
```typescript
// File: shared/schema.ts (lines 123-131)
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

**Key observation**: The `quizAssignments` table has a unique constraint on `(quizId, studentId)`, ensuring a student can only be assigned once per quiz.

---

## Target 2: Student Dashboard Fetch Route

### Route Handler: `GET /api/quizzes/available`
```typescript
// File: server/routes.ts (lines 724-738)
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

**Flow**:
1. Extracts `studentId` from Supabase JWT token via `req.authUser.id`
2. Calls `storage.getQuizAssignmentsForStudent(studentId)`
3. Filters results to only "published" quizzes that are not archived
4. Deduplicates by `quizId` using a Map
5. Returns the quiz objects

---

## Target 3: Storage Query — Database Implementation

### Method: `getQuizAssignmentsForStudent()` (DatabaseStorage)
```typescript
// File: server/storage.ts (lines 422-429)
async getQuizAssignmentsForStudent(studentId: string): Promise<(QuizAssignment & { quiz: SomaQuiz })[]> {
  const rows = await this.database
    .select({ assignment: quizAssignments, quiz: somaQuizzes })
    .from(quizAssignments)
    .innerJoin(somaQuizzes, eq(quizAssignments.quizId, somaQuizzes.id))
    .where(eq(quizAssignments.studentId, studentId));
  return rows.map((r) => ({ ...r.assignment, quiz: r.quiz }));
}
```

**SQL Equivalent**:
```sql
SELECT assignment.*, quiz.*
FROM quiz_assignments AS assignment
INNER JOIN soma_quizzes AS quiz ON assignment.quiz_id = quiz.id
WHERE assignment.student_id = $1;
```

**Key behavior**: Only returns quizzes that have a corresponding row in `quiz_assignments` for the given student.

### Method: `getQuizAssignmentsForStudent()` (MemoryStorage)
```typescript
// File: server/storage.ts (lines 799-807)
async getQuizAssignmentsForStudent(studentId: string): Promise<(QuizAssignment & { quiz: SomaQuiz })[]> {
  return this.quizAssignmentsList
    .filter((qa) => qa.studentId === studentId)
    .map((qa) => {
      const quiz = this.somaQuizzesList.find((q) => q.id === qa.quizId);
      if (!quiz) return null;
      return { ...qa, quiz };
    })
    .filter(Boolean) as (QuizAssignment & { quiz: SomaQuiz })[];
}
```

**Behavior**: Filters in-memory assignments list by studentId, then looks up quiz details.

---

## Target 4: Tutor Assignment Logic

### Route 1: Manual Quiz Assignment
```typescript
// File: server/routes.ts (lines 481-506)
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

**Flow**:
1. Verify tutor owns the quiz (`quiz.authorId === tutorId`)
2. Verify all students are adopted by tutor
3. Call `storage.createQuizAssignments(quizId, validIds)`

### Route 2: Create Quiz + Auto-Assign (Copilot)
```typescript
// File: server/routes.ts (lines 1443-1490)
app.post("/api/tutor/quizzes/generate", requireTutor, async (req, res) => {
  try {
    const tutorId = (req as any).tutorId;
    const parsed = somaGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
    }

    const { topic, title, curriculumContext, subject, syllabus, level } = parsed.data;
    const requestedStudentIds = sanitizeStudentIds(req.body?.assignTo);
    const quizTitle = title || `${topic} Quiz`;

    const result = await generateAuditedQuiz({
      topic, subject, syllabus, level,
      copilotPrompt: curriculumContext,
    });

    const adopted = await storage.getAdoptedStudents(tutorId);
    const adoptedIds = new Set(adopted.map((s) => s.id));
    const validAssignedStudentIds = requestedStudentIds.filter((id) => adoptedIds.has(id));

    const bundle = await storage.createSomaQuizBundle({
      quiz: {
        title: quizTitle,
        topic,
        subject,
        syllabus,
        level,
        curriculumContext: curriculumContext || null,
        authorId: tutorId,
        status: "published",
        isArchived: false,
      },
      questions: result.questions.map((q) => ({
        stem: q.stem,
        options: q.options,
        correctAnswer: q.correct_answer,
        explanation: q.explanation,
        marks: q.marks,
      })),
      assignedStudentIds: validAssignedStudentIds,
    });

    res.json({
      quiz: bundle.quiz,
      questions: bundle.questions,
      assignments: bundle.assignments.length,
      assignedStudentIds: validAssignedStudentIds,
      pipeline: {
        // ... response details ...
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to generate quiz" });
  }
});
```

**Flow**:
1. Generate quiz via AI pipeline
2. Filter `assignTo` list to only adopted students
3. Call `storage.createSomaQuizBundle()` with filtered list

### Storage Method: `createQuizAssignments()` (DatabaseStorage)
```typescript
// File: server/storage.ts (lines 416-420)
async createQuizAssignments(quizId: number, studentIds: string[]): Promise<QuizAssignment[]> {
  if (studentIds.length === 0) return [];
  const values = studentIds.map((studentId) => ({ quizId, studentId, status: "pending" }));
  return this.database.insert(quizAssignments).values(values).onConflictDoNothing().returning();
}
```

**SQL Equivalent**:
```sql
INSERT INTO quiz_assignments (quiz_id, student_id, status)
VALUES ($1, $2, 'pending'), ($3, $4, 'pending'), ...
ON CONFLICT DO NOTHING
RETURNING *;
```

**Key behavior**: Uses `onConflictDoNothing()` to silently skip duplicate assignments.

### Storage Method: `createQuizAssignments()` (MemoryStorage)
```typescript
// File: server/storage.ts (lines 786-797)
async createQuizAssignments(quizId: number, studentIds: string[]): Promise<QuizAssignment[]> {
  const created: QuizAssignment[] = [];
  for (const studentId of studentIds) {
    const existing = this.quizAssignmentsList.find((qa) => qa.quizId === quizId && qa.studentId === studentId);
    if (!existing) {
      const record: QuizAssignment = { id: this.quizAssignmentId++, quizId, studentId, status: "pending", createdAt: new Date() };
      this.quizAssignmentsList.push(record);
      created.push(record);
    }
  }
  return created;
}
```

### Storage Method: `createSomaQuizBundle()` (DatabaseStorage)
```typescript
// File: server/storage.ts (lines 239-261)
async createSomaQuizBundle(input: {
  quiz: InsertSomaQuiz;
  questions: SomaQuizBundleQuestionInput[];
  assignedStudentIds?: string[];
}): Promise<{ quiz: SomaQuiz; questions: SomaQuestion[]; assignments: QuizAssignment[] }> {
  return this.database.transaction(async (tx) => {
    const [quiz] = await tx.insert(somaQuizzes).values(input.quiz).returning();
    const questions = input.questions.length === 0
      ? []
      : await tx.insert(somaQuestions).values(
        input.questions.map((q) => ({ ...q, quizId: quiz.id }))
      ).returning();

    const uniqueStudentIds = Array.from(new Set(input.assignedStudentIds ?? []));
    const assignments = uniqueStudentIds.length === 0
      ? []
      : await tx.insert(quizAssignments).values(
        uniqueStudentIds.map((studentId) => ({ quizId: quiz.id, studentId, status: "pending" }))
      ).onConflictDoNothing().returning();

    return { quiz, questions, assignments };
  });
}
```

**Key behavior**: Wraps quiz + questions + assignments in a transaction. If `assignedStudentIds` is empty, **no assignments are created**.

---

## Summary of Assignment Flow

### Success Path (Student gets quiz):
1. Tutor creates quiz via Copilot with `assignTo: [studentId1, studentId2, ...]`
2. Tutor calls `/api/tutor/quizzes/generate` with `assignTo` list
3. Route validates students are adopted by tutor
4. Route calls `createSomaQuizBundle()` with validated `assignedStudentIds`
5. Bundle method writes rows to `quiz_assignments` table
6. **Later**, student logs in and calls `/api/quizzes/available`
7. Route calls `getQuizAssignmentsForStudent(studentId)` → queries `quiz_assignments` table
8. Query only returns quizzes with matching `quiz_assignments` row
9. Quiz appears on student dashboard ✅

### Data Leak Path (Student sees quiz they shouldn't):
- **Hypothesis 1**: `assignedStudentIds` in Copilot form is empty or null, so `createSomaQuizBundle()` skips assignment insertion
  - Result: Quiz created but not assigned to anyone
  - Student sees nothing (unless Hypothesis 2 applies)

- **Hypothesis 2**: Tutor creates quiz via Copilot with students selected, but request fails silently or `assignedStudentIds` isn't being passed to backend
  - Result: Quiz inserted but assignments not created
  - Student logs in, queries returns empty

- **Hypothesis 3**: New students are somehow getting rows in `quiz_assignments` automatically (e.g., a trigger or batch insert logic)
  - This would explain seeing global quiz pool

- **Hypothesis 4**: The fetch route or storage method is incorrectly querying ALL quizzes instead of only assigned ones
  - Would require a code defect in lines 724-738 or 422-429

---

## Questions for Investigation

1. **Are `quiz_assignments` rows being written when tutors create/assign quizzes?**
   - Check database: `SELECT COUNT(*) FROM quiz_assignments;`
   - Check if new assignments appear after tutor creates a quiz

2. **Are newly registered students getting automatic assignments?**
   - Check database: `SELECT * FROM quiz_assignments WHERE student_id = 'NEW_STUDENT_UUID';`

3. **Is the frontend correctly sending `assignTo` to the `/api/tutor/quizzes/generate` endpoint?**
   - Check network logs in browser DevTools
   - Verify `req.body.assignTo` is populated in route handler

4. **Is the route handler correctly filtering to only adopted students?**
   - Add logs to line 1462: Log `requestedStudentIds`, `adoptedIds`, `validAssignedStudentIds`

5. **Is `createSomaQuizBundle()` correctly passing `assignedStudentIds` to the transaction?**
   - Verify line 1483 passes the filtered list

6. **Does the database have a default trigger that auto-assigns all quizzes to new students?**
   - Check PostgreSQL schema for triggers on `soma_users` or `quiz_assignments`

