import {
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type Student, type InsertStudent,
  type Submission, type InsertSubmission,
  type SomaQuiz, type InsertSomaQuiz,
  type SomaQuestion, type InsertSomaQuestion,
  type SomaUser, type InsertSomaUser,
  type SomaReport, type InsertSomaReport,
  type TutorStudent, type InsertTutorStudent,
  type QuizAssignment, type InsertQuizAssignment,
  type TutorComment, type InsertTutorComment,
  quizzes, questions, students, submissions,
  somaQuizzes, somaQuestions, somaUsers, somaReports,
  tutorStudents, quizAssignments, tutorComments,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ne, notInArray, inArray } from "drizzle-orm";

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

type SomaQuizBundleQuestionInput = {
  stem: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  marks?: number;
};

export interface IStorage {
  createQuiz(quiz: InsertQuiz): Promise<Quiz>;
  getQuizzes(): Promise<Quiz[]>;
  getQuiz(id: number): Promise<Quiz | undefined>;
  updateQuiz(id: number, data: Partial<InsertQuiz>): Promise<Quiz | undefined>;
  deleteQuiz(id: number): Promise<void>;

  createQuestions(questionList: InsertQuestion[]): Promise<Question[]>;
  getQuestionsByQuizId(quizId: number): Promise<Question[]>;
  deleteQuestion(id: number): Promise<void>;

  findOrCreateStudent(student: InsertStudent): Promise<Student>;
  getStudent(id: number): Promise<Student | undefined>;
  findStudentByName(firstName: string, lastName: string): Promise<Student | undefined>;

  createSubmission(submission: InsertSubmission): Promise<Submission>;
  getSubmissionsByQuizId(quizId: number): Promise<(Submission & { student: Student })[]>;
  deleteSubmission(id: number): Promise<void>;
  deleteSubmissionsByQuizId(quizId: number): Promise<void>;
  checkStudentSubmission(quizId: number, firstName: string, lastName: string): Promise<boolean>;
  getStudentSubmission(quizId: number, firstName: string, lastName: string): Promise<Submission | undefined>;

  upsertSomaUser(user: InsertSomaUser): Promise<SomaUser>;

  createSomaQuiz(quiz: InsertSomaQuiz): Promise<SomaQuiz>;
  createSomaQuizBundle(input: {
    quiz: InsertSomaQuiz;
    questions: SomaQuizBundleQuestionInput[];
    assignedStudentIds?: string[];
  }): Promise<{ quiz: SomaQuiz; questions: SomaQuestion[]; assignments: QuizAssignment[] }>;
  getSomaQuizzes(): Promise<SomaQuiz[]>;
  getSomaQuiz(id: number): Promise<SomaQuiz | undefined>;
  createSomaQuestions(questionList: InsertSomaQuestion[]): Promise<SomaQuestion[]>;
  getSomaQuestionsByQuizId(quizId: number): Promise<SomaQuestion[]>;
  getSomaReportsByStudentId(studentId: string): Promise<(SomaReport & { quiz: SomaQuiz })[]>;
  getSubmissionsByStudentUserId(studentId: string): Promise<(Submission & { quiz: Quiz })[]>;
  createSomaReport(report: InsertSomaReport): Promise<SomaReport>;
  updateSomaReport(reportId: number, data: Partial<{ status: string; aiFeedbackHtml: string | null }>): Promise<SomaReport | undefined>;
  checkSomaSubmission(quizId: number, studentId: string): Promise<boolean>;
  getSomaReportById(reportId: number): Promise<(SomaReport & { quiz: SomaQuiz }) | undefined>;

  // Multi-tenant: Tutor-Student management
  getSomaUserByEmail(email: string): Promise<SomaUser | undefined>;
  getSomaUserById(id: string): Promise<SomaUser | undefined>;
  getAllStudents(): Promise<SomaUser[]>;
  adoptStudent(tutorId: string, studentId: string): Promise<TutorStudent>;
  removeAdoptedStudent(tutorId: string, studentId: string): Promise<void>;
  getAdoptedStudents(tutorId: string): Promise<SomaUser[]>;
  getAvailableStudents(tutorId: string): Promise<SomaUser[]>;

  // Multi-tenant: Quiz assignments
  createQuizAssignments(quizId: number, studentIds: string[]): Promise<QuizAssignment[]>;
  getQuizAssignmentsForStudent(studentId: string): Promise<(QuizAssignment & { quiz: SomaQuiz })[]>;
  getQuizAssignmentsForQuiz(quizId: number): Promise<(QuizAssignment & { student: SomaUser })[]>;
  updateQuizAssignmentStatus(quizId: number, studentId: string, status: string): Promise<void>;

  // Multi-tenant: Tutor quiz management
  getSomaQuizzesByAuthor(authorId: string): Promise<SomaQuiz[]>;

  // Tutor comments
  addTutorComment(comment: InsertTutorComment): Promise<TutorComment>;
  getTutorComments(tutorId: string, studentId: string): Promise<TutorComment[]>;

  // Super Admin
  getAllSomaUsers(): Promise<SomaUser[]>;
  deleteSomaUser(userId: string): Promise<void>;
  deleteSomaQuiz(quizId: number): Promise<void>;
  getAllSomaQuizzes(): Promise<SomaQuiz[]>;
}

class DatabaseStorage implements IStorage {
  constructor(private readonly database: NonNullable<typeof db>) {}

  async createQuiz(quiz: InsertQuiz): Promise<Quiz> {
    const [result] = await this.database.insert(quizzes).values(quiz).returning();
    return result;
  }

  async getQuizzes(): Promise<Quiz[]> {
    return this.database.select().from(quizzes).orderBy(quizzes.createdAt);
  }

  async getQuiz(id: number): Promise<Quiz | undefined> {
    const [result] = await this.database.select().from(quizzes).where(eq(quizzes.id, id));
    return result;
  }

  async updateQuiz(id: number, data: Partial<InsertQuiz>): Promise<Quiz | undefined> {
    const [result] = await this.database.update(quizzes).set(data).where(eq(quizzes.id, id)).returning();
    return result;
  }

  async deleteQuiz(id: number): Promise<void> {
    await this.database.delete(submissions).where(eq(submissions.quizId, id));
    await this.database.delete(quizzes).where(eq(quizzes.id, id));
  }

  async createQuestions(questionList: InsertQuestion[]): Promise<Question[]> {
    if (questionList.length === 0) return [];
    const normalizedQuestions = questionList.map((question) => ({
      ...question,
      options: Array.isArray(question.options) ? [...question.options] : [],
    }));

    return this.database.insert(questions).values(normalizedQuestions).returning();
  }

  async getQuestionsByQuizId(quizId: number): Promise<Question[]> {
    return this.database.select().from(questions).where(eq(questions.quizId, quizId));
  }

  async deleteQuestion(id: number): Promise<void> {
    await this.database.delete(questions).where(eq(questions.id, id));
  }

  async findOrCreateStudent(student: InsertStudent): Promise<Student> {
    const fn = sanitizeName(student.firstName);
    const ln = sanitizeName(student.lastName);
    const existing = await this.findStudentByName(fn, ln);
    if (existing) return existing;
    try {
      const [result] = await this.database.insert(students).values({ firstName: fn, lastName: ln }).returning();
      return result;
    } catch {
      const fallback = await this.findStudentByName(fn, ln);
      if (fallback) return fallback;
      throw new Error("Failed to create or find student");
    }
  }

  async getStudent(id: number): Promise<Student | undefined> {
    const [result] = await this.database.select().from(students).where(eq(students.id, id));
    return result;
  }

  async findStudentByName(firstName: string, lastName: string): Promise<Student | undefined> {
    const fn = sanitizeName(firstName);
    const ln = sanitizeName(lastName);
    const [result] = await this.database.select().from(students)
      .where(and(eq(students.firstName, fn), eq(students.lastName, ln)));
    return result;
  }

  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const [result] = await this.database.insert(submissions).values(submission).returning();
    return result;
  }

  async getSubmissionsByQuizId(quizId: number): Promise<(Submission & { student: Student })[]> {
    const rows = await this.database
      .select({
        submission: submissions,
        student: students,
      })
      .from(submissions)
      .innerJoin(students, eq(submissions.studentId, students.id))
      .where(eq(submissions.quizId, quizId));
    return rows.map((r) => ({ ...r.submission, student: r.student }));
  }


  async deleteSubmission(id: number): Promise<void> {
    await this.database.delete(submissions).where(eq(submissions.id, id));
  }

  async deleteSubmissionsByQuizId(quizId: number): Promise<void> {
    await this.database.delete(submissions).where(eq(submissions.quizId, quizId));
  }

  async checkStudentSubmission(quizId: number, firstName: string, lastName: string): Promise<boolean> {
    const fn = sanitizeName(firstName);
    const ln = sanitizeName(lastName);
    const matchingStudents = await this.database.select().from(students)
      .where(and(eq(students.firstName, fn), eq(students.lastName, ln)));
    if (matchingStudents.length === 0) return false;
    for (const student of matchingStudents) {
      const [sub] = await this.database.select().from(submissions)
        .where(and(eq(submissions.studentId, student.id), eq(submissions.quizId, quizId)));
      if (sub) return true;
    }
    return false;
  }

  async getStudentSubmission(quizId: number, firstName: string, lastName: string): Promise<Submission | undefined> {
    const fn = sanitizeName(firstName);
    const ln = sanitizeName(lastName);
    const matchingStudents = await this.database.select().from(students)
      .where(and(eq(students.firstName, fn), eq(students.lastName, ln)));
    for (const student of matchingStudents) {
      const [sub] = await this.database.select().from(submissions)
        .where(and(eq(submissions.studentId, student.id), eq(submissions.quizId, quizId)));
      if (sub) return sub;
    }
    return undefined;
  }

  async createSomaQuiz(quiz: InsertSomaQuiz): Promise<SomaQuiz> {
    const [result] = await this.database.insert(somaQuizzes).values(quiz).returning();
    return result;
  }

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

  async getSomaQuizzes(): Promise<SomaQuiz[]> {
    return this.database.select().from(somaQuizzes).orderBy(somaQuizzes.createdAt);
  }

  async getSomaQuiz(id: number): Promise<SomaQuiz | undefined> {
    const [result] = await this.database.select().from(somaQuizzes).where(eq(somaQuizzes.id, id));
    return result;
  }

  async createSomaQuestions(questionList: InsertSomaQuestion[]): Promise<SomaQuestion[]> {
    if (questionList.length === 0) return [];
    const normalized = questionList.map((q) => ({
      ...q,
      options: Array.isArray(q.options) ? [...q.options] as string[] : [],
    }));
    return this.database.insert(somaQuestions).values(normalized).returning();
  }

  async getSomaQuestionsByQuizId(quizId: number): Promise<SomaQuestion[]> {
    return this.database.select().from(somaQuestions).where(eq(somaQuestions.quizId, quizId));
  }

  async upsertSomaUser(user: InsertSomaUser): Promise<SomaUser> {
    const [result] = await this.database
      .insert(somaUsers)
      .values(user)
      .onConflictDoUpdate({
        target: somaUsers.id,
        set: { email: user.email, displayName: user.displayName, role: user.role ?? "student" },
      })
      .returning();
    return result;
  }

  async getSomaReportsByStudentId(studentId: string): Promise<(SomaReport & { quiz: SomaQuiz })[]> {
    const rows = await this.database
      .select({ report: somaReports, quiz: somaQuizzes })
      .from(somaReports)
      .innerJoin(somaQuizzes, eq(somaReports.quizId, somaQuizzes.id))
      .where(eq(somaReports.studentId, studentId));
    return rows.map((r) => ({ ...r.report, quiz: r.quiz }));
  }

  async getSubmissionsByStudentUserId(studentId: string): Promise<(Submission & { quiz: Quiz })[]> {
    const user = await this.database.select().from(somaUsers).where(eq(somaUsers.id, studentId));
    if (!user.length) return [];
    const email = user[0].email;
    const displayName = user[0].displayName || email.split("@")[0];
    const nameParts = displayName.split(" ");
    const firstName = sanitizeName(nameParts[0] || "");
    const lastName = sanitizeName(nameParts.slice(1).join(" ") || "");
    if (!firstName) return [];
    const matchingStudents = await this.database.select().from(students)
      .where(lastName ? and(eq(students.firstName, firstName), eq(students.lastName, lastName)) : eq(students.firstName, firstName));
    if (!matchingStudents.length) return [];
    const allSubmissions: (Submission & { quiz: Quiz })[] = [];
    for (const student of matchingStudents) {
      const rows = await this.database
        .select({ submission: submissions, quiz: quizzes })
        .from(submissions)
        .innerJoin(quizzes, eq(submissions.quizId, quizzes.id))
        .where(eq(submissions.studentId, student.id));
      allSubmissions.push(...rows.map((r) => ({ ...r.submission, quiz: r.quiz })));
    }
    return allSubmissions;
  }

  async createSomaReport(report: InsertSomaReport): Promise<SomaReport> {
    const [result] = await this.database.insert(somaReports).values(report).returning();
    return result;
  }

  async updateSomaReport(reportId: number, data: Partial<{ status: string; aiFeedbackHtml: string | null }>): Promise<SomaReport | undefined> {
    const [result] = await this.database.update(somaReports).set(data).where(eq(somaReports.id, reportId)).returning();
    return result;
  }

  async checkSomaSubmission(quizId: number, studentId: string): Promise<boolean> {
    const existing = await this.database.select().from(somaReports)
      .where(and(eq(somaReports.quizId, quizId), eq(somaReports.studentId, studentId)));
    return existing.length > 0;
  }

  async getSomaReportById(reportId: number): Promise<(SomaReport & { quiz: SomaQuiz }) | undefined> {
    const rows = await this.database
      .select({ report: somaReports, quiz: somaQuizzes })
      .from(somaReports)
      .innerJoin(somaQuizzes, eq(somaReports.quizId, somaQuizzes.id))
      .where(eq(somaReports.id, reportId));
    if (rows.length === 0) return undefined;
    return { ...rows[0].report, quiz: rows[0].quiz };
  }

  async getSomaUserByEmail(email: string): Promise<SomaUser | undefined> {
    const [result] = await this.database.select().from(somaUsers).where(eq(somaUsers.email, email));
    return result;
  }

  async getSomaUserById(id: string): Promise<SomaUser | undefined> {
    const [result] = await this.database.select().from(somaUsers).where(eq(somaUsers.id, id));
    return result;
  }

  async getAllStudents(): Promise<SomaUser[]> {
    return this.database.select().from(somaUsers).where(eq(somaUsers.role, "student"));
  }

  async adoptStudent(tutorId: string, studentId: string): Promise<TutorStudent> {
    const [result] = await this.database
      .insert(tutorStudents)
      .values({ tutorId, studentId })
      .onConflictDoNothing()
      .returning();
    if (!result) {
      const [existing] = await this.database.select().from(tutorStudents)
        .where(and(eq(tutorStudents.tutorId, tutorId), eq(tutorStudents.studentId, studentId)));
      return existing;
    }
    return result;
  }

  async removeAdoptedStudent(tutorId: string, studentId: string): Promise<void> {
    await this.database.delete(tutorStudents)
      .where(and(eq(tutorStudents.tutorId, tutorId), eq(tutorStudents.studentId, studentId)));
  }

  async getAdoptedStudents(tutorId: string): Promise<SomaUser[]> {
    const rows = await this.database
      .select({ student: somaUsers })
      .from(tutorStudents)
      .innerJoin(somaUsers, eq(tutorStudents.studentId, somaUsers.id))
      .where(eq(tutorStudents.tutorId, tutorId));
    return rows.map((r) => r.student);
  }

  async getAvailableStudents(tutorId: string): Promise<SomaUser[]> {
    const adopted = await this.database
      .select({ studentId: tutorStudents.studentId })
      .from(tutorStudents)
      .where(eq(tutorStudents.tutorId, tutorId));
    const adoptedIds = adopted.map((a) => a.studentId);
    if (adoptedIds.length === 0) {
      return this.database.select().from(somaUsers)
        .where(and(eq(somaUsers.role, "student"), ne(somaUsers.id, tutorId)));
    }
    return this.database.select().from(somaUsers)
      .where(and(
        eq(somaUsers.role, "student"),
        ne(somaUsers.id, tutorId),
        notInArray(somaUsers.id, adoptedIds),
      ));
  }

  async createQuizAssignments(quizId: number, studentIds: string[]): Promise<QuizAssignment[]> {
    if (studentIds.length === 0) return [];
    const values = studentIds.map((studentId) => ({ quizId, studentId, status: "pending" }));
    return this.database.insert(quizAssignments).values(values).onConflictDoNothing().returning();
  }

  async getQuizAssignmentsForStudent(studentId: string): Promise<(QuizAssignment & { quiz: SomaQuiz })[]> {
    const rows = await this.database
      .select({ assignment: quizAssignments, quiz: somaQuizzes })
      .from(quizAssignments)
      .innerJoin(somaQuizzes, eq(quizAssignments.quizId, somaQuizzes.id))
      .where(eq(quizAssignments.studentId, studentId));
    return rows.map((r) => ({ ...r.assignment, quiz: r.quiz }));
  }

  async getQuizAssignmentsForQuiz(quizId: number): Promise<(QuizAssignment & { student: SomaUser })[]> {
    const rows = await this.database
      .select({ assignment: quizAssignments, student: somaUsers })
      .from(quizAssignments)
      .innerJoin(somaUsers, eq(quizAssignments.studentId, somaUsers.id))
      .where(eq(quizAssignments.quizId, quizId));
    return rows.map((r) => ({ ...r.assignment, student: r.student }));
  }

  async updateQuizAssignmentStatus(quizId: number, studentId: string, status: string): Promise<void> {
    await this.database.update(quizAssignments)
      .set({ status })
      .where(and(eq(quizAssignments.quizId, quizId), eq(quizAssignments.studentId, studentId)));
  }

  async getSomaQuizzesByAuthor(authorId: string): Promise<SomaQuiz[]> {
    return this.database.select().from(somaQuizzes)
      .where(eq(somaQuizzes.authorId, authorId))
      .orderBy(somaQuizzes.createdAt);
  }

  async addTutorComment(comment: InsertTutorComment): Promise<TutorComment> {
    const [result] = await this.database.insert(tutorComments).values(comment).returning();
    return result;
  }

  async getTutorComments(tutorId: string, studentId: string): Promise<TutorComment[]> {
    return this.database.select().from(tutorComments)
      .where(and(eq(tutorComments.tutorId, tutorId), eq(tutorComments.studentId, studentId)))
      .orderBy(tutorComments.createdAt);
  }

  async getAllSomaUsers(): Promise<SomaUser[]> {
    return this.database.select().from(somaUsers).orderBy(somaUsers.createdAt);
  }

  async deleteSomaUser(userId: string): Promise<void> {
    await this.database.delete(somaUsers).where(eq(somaUsers.id, userId));
  }

  async deleteSomaQuiz(quizId: number): Promise<void> {
    await this.database.delete(somaQuestions).where(eq(somaQuestions.quizId, quizId));
    await this.database.delete(somaReports).where(eq(somaReports.quizId, quizId));
    await this.database.delete(quizAssignments).where(eq(quizAssignments.quizId, quizId));
    await this.database.delete(somaQuizzes).where(eq(somaQuizzes.id, quizId));
  }

  async getAllSomaQuizzes(): Promise<SomaQuiz[]> {
    return this.database.select().from(somaQuizzes).orderBy(somaQuizzes.createdAt);
  }

}

class MemoryStorage implements IStorage {
  private quizzes: Quiz[] = [];
  private questions: Question[] = [];
  private students: Student[] = [];
  private submissions: Submission[] = [];
  private somaQuizzesList: SomaQuiz[] = [];
  private somaQuestionsList: SomaQuestion[] = [];
  private somaUsersList: SomaUser[] = [];
  private quizId = 1;
  private questionId = 1;
  private studentId = 1;
  private submissionId = 1;
  private somaQuizId = 1;
  private somaQuestionId = 1;

  async createQuiz(quiz: InsertQuiz): Promise<Quiz> {
    const created: Quiz = { id: this.quizId++, createdAt: new Date(), syllabus: null, level: null, subject: null, isArchived: false, ...quiz };
    this.quizzes.push(created);
    return created;
  }

  async getQuizzes(): Promise<Quiz[]> { return [...this.quizzes]; }
  async getQuiz(id: number): Promise<Quiz | undefined> { return this.quizzes.find((q) => q.id === id); }

  async updateQuiz(id: number, data: Partial<InsertQuiz>): Promise<Quiz | undefined> {
    const idx = this.quizzes.findIndex((q) => q.id === id);
    if (idx === -1) return undefined;
    this.quizzes[idx] = { ...this.quizzes[idx], ...data };
    return this.quizzes[idx];
  }

  async deleteQuiz(id: number): Promise<void> {
    this.quizzes = this.quizzes.filter((q) => q.id !== id);
    this.questions = this.questions.filter((q) => q.quizId !== id);
    this.submissions = this.submissions.filter((s) => s.quizId !== id);
  }

  async createQuestions(questionList: InsertQuestion[]): Promise<Question[]> {
    const created = questionList.map((q) => ({
      id: this.questionId++,
      ...q,
      options: Array.isArray(q.options) ? [...(q.options as string[])] : [],
      imageUrl: q.imageUrl ?? null,
      marksWorth: q.marksWorth ?? 1,
    }));
    this.questions.push(...created);
    return created;
  }

  async getQuestionsByQuizId(quizId: number): Promise<Question[]> {
    return this.questions.filter((q) => q.quizId === quizId);
  }

  async deleteQuestion(id: number): Promise<void> {
    this.questions = this.questions.filter((q) => q.id !== id);
  }

  async findOrCreateStudent(student: InsertStudent): Promise<Student> {
    const fn = sanitizeName(student.firstName);
    const ln = sanitizeName(student.lastName);
    const existing = await this.findStudentByName(fn, ln);
    if (existing) return existing;
    const created: Student = {
      id: this.studentId++,
      firstName: fn,
      lastName: ln,
    };
    this.students.push(created);
    return created;
  }

  async getStudent(id: number): Promise<Student | undefined> { return this.students.find((s) => s.id === id); }

  async findStudentByName(firstName: string, lastName: string): Promise<Student | undefined> {
    const fn = sanitizeName(firstName);
    const ln = sanitizeName(lastName);
    return this.students.find((s) => s.firstName === fn && s.lastName === ln);
  }

  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const created: Submission = { id: this.submissionId++, submittedAt: new Date(), ...submission };
    this.submissions.push(created);
    return created;
  }

  async getSubmissionsByQuizId(quizId: number): Promise<(Submission & { student: Student })[]> {
    return this.submissions
      .filter((s) => s.quizId === quizId)
      .map((s) => ({ ...s, student: this.students.find((st) => st.id === s.studentId)! }))
      .filter((s) => Boolean(s.student));
  }


  async deleteSubmission(id: number): Promise<void> {
    this.submissions = this.submissions.filter((s) => s.id !== id);
  }

  async deleteSubmissionsByQuizId(quizId: number): Promise<void> {
    this.submissions = this.submissions.filter((s) => s.quizId !== quizId);
  }

  async checkStudentSubmission(quizId: number, firstName: string, lastName: string): Promise<boolean> {
    const student = await this.findStudentByName(firstName, lastName);
    if (!student) return false;
    return this.submissions.some((s) => s.quizId === quizId && s.studentId === student.id);
  }

  async getStudentSubmission(quizId: number, firstName: string, lastName: string): Promise<Submission | undefined> {
    const student = await this.findStudentByName(firstName, lastName);
    if (!student) return undefined;
    return this.submissions.find((s) => s.quizId === quizId && s.studentId === student.id);
  }

  async createSomaQuiz(quiz: InsertSomaQuiz): Promise<SomaQuiz> {
    const created: SomaQuiz = {
      id: this.somaQuizId++,
      createdAt: new Date(),
      title: quiz.title,
      topic: quiz.topic,
      syllabus: quiz.syllabus ?? "IEB",
      level: quiz.level ?? "Grade 6-12",
      subject: quiz.subject ?? null,
      curriculumContext: quiz.curriculumContext ?? null,
      authorId: quiz.authorId ?? null,
      status: quiz.status ?? "draft",
      isArchived: quiz.isArchived ?? false,
    };
    this.somaQuizzesList.push(created);
    return created;
  }

  async createSomaQuizBundle(input: {
    quiz: InsertSomaQuiz;
    questions: SomaQuizBundleQuestionInput[];
    assignedStudentIds?: string[];
  }): Promise<{ quiz: SomaQuiz; questions: SomaQuestion[]; assignments: QuizAssignment[] }> {
    const quiz = await this.createSomaQuiz(input.quiz);
    const questions = await this.createSomaQuestions(input.questions.map((q) => ({ ...q, quizId: quiz.id })));
    const assignments = await this.createQuizAssignments(quiz.id, Array.from(new Set(input.assignedStudentIds ?? [])));
    return { quiz, questions, assignments };
  }

  async getSomaQuizzes(): Promise<SomaQuiz[]> { return [...this.somaQuizzesList]; }
  async getSomaQuiz(id: number): Promise<SomaQuiz | undefined> { return this.somaQuizzesList.find((q) => q.id === id); }

  async createSomaQuestions(questionList: InsertSomaQuestion[]): Promise<SomaQuestion[]> {
    const created = questionList.map((q) => ({
      id: this.somaQuestionId++,
      ...q,
      options: Array.isArray(q.options) ? [...(q.options as string[])] : [],
      explanation: q.explanation,
      marks: q.marks ?? 1,
    }));
    this.somaQuestionsList.push(...created);
    return created;
  }

  async getSomaQuestionsByQuizId(quizId: number): Promise<SomaQuestion[]> {
    return this.somaQuestionsList.filter((q) => q.quizId === quizId);
  }

  async upsertSomaUser(user: InsertSomaUser): Promise<SomaUser> {
    const idx = this.somaUsersList.findIndex((u) => u.id === user.id);
    const record: SomaUser = { createdAt: new Date(), displayName: null, role: "student", ...user };
    if (idx >= 0) {
      this.somaUsersList[idx] = { ...this.somaUsersList[idx], email: user.email, displayName: user.displayName ?? this.somaUsersList[idx].displayName, role: user.role ?? this.somaUsersList[idx].role };
      return this.somaUsersList[idx];
    }
    this.somaUsersList.push(record);
    return record;
  }

  async getSomaReportsByStudentId(_studentId: string): Promise<(SomaReport & { quiz: SomaQuiz })[]> {
    return [];
  }

  async getSubmissionsByStudentUserId(_studentId: string): Promise<(Submission & { quiz: Quiz })[]> {
    return [];
  }

  private somaReportsList: SomaReport[] = [];
  private somaReportId = 1;

  async createSomaReport(report: InsertSomaReport): Promise<SomaReport> {
    const created: SomaReport = { id: this.somaReportId++, createdAt: new Date(), aiFeedbackHtml: null, answersJson: null, status: "pending", studentId: report.studentId ?? null, ...report };
    this.somaReportsList.push(created);
    return created;
  }

  async updateSomaReport(reportId: number, data: Partial<{ status: string; aiFeedbackHtml: string | null }>): Promise<SomaReport | undefined> {
    const report = this.somaReportsList.find((r) => r.id === reportId);
    if (!report) return undefined;
    Object.assign(report, data);
    return report;
  }

  async checkSomaSubmission(quizId: number, studentId: string): Promise<boolean> {
    return this.somaReportsList.some((r) => r.quizId === quizId && r.studentId === studentId);
  }

  async getSomaReportById(reportId: number): Promise<(SomaReport & { quiz: SomaQuiz }) | undefined> {
    const report = this.somaReportsList.find((r) => r.id === reportId);
    if (!report) return undefined;
    const quiz = this.somaQuizzesList.find((q) => q.id === report.quizId);
    if (!quiz) return undefined;
    return { ...report, quiz };
  }

  // Multi-tenant stubs for MemoryStorage
  async getSomaUserByEmail(email: string): Promise<SomaUser | undefined> {
    return this.somaUsersList.find((u) => u.email === email);
  }

  async getSomaUserById(id: string): Promise<SomaUser | undefined> {
    return this.somaUsersList.find((u) => u.id === id);
  }

  async getAllStudents(): Promise<SomaUser[]> {
    return this.somaUsersList.filter((u) => u.role === "student");
  }

  private tutorStudentsList: TutorStudent[] = [];
  private tutorStudentId = 1;

  async adoptStudent(tutorId: string, studentId: string): Promise<TutorStudent> {
    const existing = this.tutorStudentsList.find((ts) => ts.tutorId === tutorId && ts.studentId === studentId);
    if (existing) return existing;
    const record: TutorStudent = { id: this.tutorStudentId++, tutorId, studentId, createdAt: new Date() };
    this.tutorStudentsList.push(record);
    return record;
  }

  async removeAdoptedStudent(tutorId: string, studentId: string): Promise<void> {
    this.tutorStudentsList = this.tutorStudentsList.filter(
      (ts) => !(ts.tutorId === tutorId && ts.studentId === studentId)
    );
  }

  async getAdoptedStudents(tutorId: string): Promise<SomaUser[]> {
    const adoptedIds = this.tutorStudentsList.filter((ts) => ts.tutorId === tutorId).map((ts) => ts.studentId);
    return this.somaUsersList.filter((u) => adoptedIds.includes(u.id));
  }

  async getAvailableStudents(tutorId: string): Promise<SomaUser[]> {
    const adoptedIds = new Set(this.tutorStudentsList.filter((ts) => ts.tutorId === tutorId).map((ts) => ts.studentId));
    return this.somaUsersList.filter((u) => u.role === "student" && u.id !== tutorId && !adoptedIds.has(u.id));
  }

  private quizAssignmentsList: QuizAssignment[] = [];
  private quizAssignmentId = 1;

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

  async getQuizAssignmentsForQuiz(quizId: number): Promise<(QuizAssignment & { student: SomaUser })[]> {
    return this.quizAssignmentsList
      .filter((qa) => qa.quizId === quizId)
      .map((qa) => {
        const student = this.somaUsersList.find((u) => u.id === qa.studentId);
        if (!student) return null;
        return { ...qa, student };
      })
      .filter(Boolean) as (QuizAssignment & { student: SomaUser })[];
  }

  async updateQuizAssignmentStatus(quizId: number, studentId: string, status: string): Promise<void> {
    const qa = this.quizAssignmentsList.find((a) => a.quizId === quizId && a.studentId === studentId);
    if (qa) qa.status = status;
  }

  async getSomaQuizzesByAuthor(authorId: string): Promise<SomaQuiz[]> {
    return this.somaQuizzesList.filter((q) => q.authorId === authorId);
  }

  private tutorCommentsList: TutorComment[] = [];
  async addTutorComment(comment: InsertTutorComment): Promise<TutorComment> {
    const tc: TutorComment = { id: this.tutorCommentsList.length + 1, ...comment, createdAt: new Date() };
    this.tutorCommentsList.push(tc);
    return tc;
  }
  async getTutorComments(tutorId: string, studentId: string): Promise<TutorComment[]> {
    return this.tutorCommentsList.filter((c) => c.tutorId === tutorId && c.studentId === studentId);
  }

  async getAllSomaUsers(): Promise<SomaUser[]> {
    return this.somaUsersList;
  }
  async deleteSomaUser(userId: string): Promise<void> {
    this.somaUsersList = this.somaUsersList.filter((u) => u.id !== userId);
  }
  async deleteSomaQuiz(quizId: number): Promise<void> {
    this.somaQuestionsList = this.somaQuestionsList.filter((q) => q.quizId !== quizId);
    this.somaQuizzesList = this.somaQuizzesList.filter((q) => q.id !== quizId);
  }
  async getAllSomaQuizzes(): Promise<SomaQuiz[]> {
    return this.somaQuizzesList;
  }

}

export const storage: IStorage = db ? new DatabaseStorage(db) : new MemoryStorage();
