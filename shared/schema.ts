import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const quizzes = pgTable("quizzes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  timeLimitMinutes: integer("time_limit_minutes").notNull(),
  dueDate: timestamp("due_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  promptText: text("prompt_text").notNull(),
  imageUrl: text("image_url"),
  options: json("options").$type<string[]>().notNull(),
  correctAnswer: text("correct_answer").notNull(),
  marksWorth: integer("marks_worth").notNull().default(1),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
});

export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id),
  totalScore: integer("total_score").notNull(),
  maxPossibleScore: integer("max_possible_score").notNull(),
  answersBreakdown: json("answers_breakdown").$type<Record<string, { answer: string; correct: boolean; marksEarned: number }>>().notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const insertQuizSchema = createInsertSchema(quizzes).omit({ id: true, createdAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertStudentSchema = createInsertSchema(students).omit({ id: true });
export const insertSubmissionSchema = createInsertSchema(submissions).omit({ id: true, submittedAt: true });

export type Quiz = typeof quizzes.$inferSelect;
export type InsertQuiz = z.infer<typeof insertQuizSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;

export const questionUploadSchema = z.array(z.object({
  prompt_text: z.string(),
  image_url: z.string().nullable().optional(),
  options: z.array(z.string()).min(2),
  correct_answer: z.string(),
  marks_worth: z.number().int().positive().default(1),
}));

export type QuestionUpload = z.infer<typeof questionUploadSchema>;
