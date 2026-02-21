import {
  type Quiz, type InsertQuiz,
  type Question, type InsertQuestion,
  type Student, type InsertStudent,
  type Submission, type InsertSubmission,
  quizzes, questions, students, submissions,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  createQuiz(quiz: InsertQuiz): Promise<Quiz>;
  getQuizzes(): Promise<Quiz[]>;
  getQuiz(id: number): Promise<Quiz | undefined>;
  deleteQuiz(id: number): Promise<void>;

  createQuestions(questionList: InsertQuestion[]): Promise<Question[]>;
  getQuestionsByQuizId(quizId: number): Promise<Question[]>;
  deleteQuestion(id: number): Promise<void>;

  createStudent(student: InsertStudent): Promise<Student>;
  getStudent(id: number): Promise<Student | undefined>;

  createSubmission(submission: InsertSubmission): Promise<Submission>;
  getSubmissionsByQuizId(quizId: number): Promise<(Submission & { student: Student })[]>;
}

export class DatabaseStorage implements IStorage {
  async createQuiz(quiz: InsertQuiz): Promise<Quiz> {
    const [result] = await db.insert(quizzes).values(quiz).returning();
    return result;
  }

  async getQuizzes(): Promise<Quiz[]> {
    return db.select().from(quizzes).orderBy(quizzes.createdAt);
  }

  async getQuiz(id: number): Promise<Quiz | undefined> {
    const [result] = await db.select().from(quizzes).where(eq(quizzes.id, id));
    return result;
  }

  async deleteQuiz(id: number): Promise<void> {
    await db.delete(quizzes).where(eq(quizzes.id, id));
  }

  async createQuestions(questionList: InsertQuestion[]): Promise<Question[]> {
    if (questionList.length === 0) return [];
    return db.insert(questions).values(questionList).returning();
  }

  async getQuestionsByQuizId(quizId: number): Promise<Question[]> {
    return db.select().from(questions).where(eq(questions.quizId, quizId));
  }

  async deleteQuestion(id: number): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    const [result] = await db.insert(students).values(student).returning();
    return result;
  }

  async getStudent(id: number): Promise<Student | undefined> {
    const [result] = await db.select().from(students).where(eq(students.id, id));
    return result;
  }

  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const [result] = await db.insert(submissions).values(submission).returning();
    return result;
  }

  async getSubmissionsByQuizId(quizId: number): Promise<(Submission & { student: Student })[]> {
    const subs = await db.select().from(submissions).where(eq(submissions.quizId, quizId));
    const results: (Submission & { student: Student })[] = [];
    for (const sub of subs) {
      const [student] = await db.select().from(students).where(eq(students.id, sub.studentId));
      if (student) {
        results.push({ ...sub, student });
      }
    }
    return results;
  }
}

export const storage = new DatabaseStorage();
