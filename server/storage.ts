import {
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type Student, type InsertStudent,
  type Submission, type InsertSubmission,
  type SomaQuiz, type InsertSomaQuiz,
  type SomaQuestion, type InsertSomaQuestion,
  quizzes, questions, students, submissions,
  somaQuizzes, somaQuestions,
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

  createSomaQuiz(quiz: InsertSomaQuiz): Promise<SomaQuiz>;
  getSomaQuizzes(): Promise<SomaQuiz[]>;
  getSomaQuiz(id: number): Promise<SomaQuiz | undefined>;
  createSomaQuestions(questionList: InsertSomaQuestion[]): Promise<SomaQuestion[]>;
  getSomaQuestionsByQuizId(quizId: number): Promise<SomaQuestion[]>;
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

}

class MemoryStorage implements IStorage {
  private quizzes: Quiz[] = [];
  private questions: Question[] = [];
  private students: Student[] = [];
  private submissions: Submission[] = [];
  private somaQuizzesList: SomaQuiz[] = [];
  private somaQuestionsList: SomaQuestion[] = [];
  private quizId = 1;
  private questionId = 1;
  private studentId = 1;
  private submissionId = 1;
  private somaQuizId = 1;
  private somaQuestionId = 1;

  async createQuiz(quiz: InsertQuiz): Promise<Quiz> {
    const created: Quiz = { id: this.quizId++, createdAt: new Date(), ...quiz };
    this.quizzes.push(created);
    return created;
  }

  async getQuizzes(): Promise<Quiz[]> { return [...this.quizzes]; }
  async getQuiz(id: number): Promise<Quiz | undefined> { return this.quizzes.find((q) => q.id === id); }

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

}

export const storage: IStorage = db ? new DatabaseStorage(db) : new MemoryStorage();
