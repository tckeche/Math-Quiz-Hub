import {
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type Student, type InsertStudent,
  type Submission, type InsertSubmission,
  type SomaQuiz, type InsertSomaQuiz,
  type SomaQuestion, type InsertSomaQuestion,
  type SomaUser, type InsertSomaUser,
  type SomaReport, type InsertSomaReport,
  quizzes, questions, students, submissions,
  somaQuizzes, somaQuestions, somaUsers, somaReports,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

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
        set: { email: user.email, displayName: user.displayName },
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
    const created: Quiz = { id: this.quizId++, createdAt: new Date(), syllabus: null, level: null, subject: null, ...quiz };
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
    const created: SomaQuiz = { id: this.somaQuizId++, createdAt: new Date(), ...quiz, curriculumContext: quiz.curriculumContext ?? null, status: quiz.status ?? "draft" };
    this.somaQuizzesList.push(created);
    return created;
  }

  async getSomaQuizzes(): Promise<SomaQuiz[]> { return [...this.somaQuizzesList]; }
  async getSomaQuiz(id: number): Promise<SomaQuiz | undefined> { return this.somaQuizzesList.find((q) => q.id === id); }

  async createSomaQuestions(questionList: InsertSomaQuestion[]): Promise<SomaQuestion[]> {
    const created = questionList.map((q) => ({
      id: this.somaQuestionId++,
      ...q,
      options: Array.isArray(q.options) ? [...(q.options as string[])] : [],
      explanation: q.explanation ?? null,
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
    const record: SomaUser = { createdAt: new Date(), displayName: null, ...user };
    if (idx >= 0) {
      this.somaUsersList[idx] = { ...this.somaUsersList[idx], email: user.email, displayName: user.displayName ?? this.somaUsersList[idx].displayName };
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

}

export const storage: IStorage = db ? new DatabaseStorage(db) : new MemoryStorage();
