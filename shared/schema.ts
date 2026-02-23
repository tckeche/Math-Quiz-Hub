import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const quizzes = pgTable("quizzes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  timeLimitMinutes: integer("time_limit_minutes").notNull(),
  dueDate: timestamp("due_date").notNull(),
  syllabus: text("syllabus"),
  level: text("level"),
  subject: text("subject"),
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
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
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

export const somaQuizzes = pgTable("soma_quizzes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  curriculumContext: text("curriculum_context"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const somaQuestions = pgTable("soma_questions", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => somaQuizzes.id, { onDelete: "cascade" }),
  stem: text("stem").notNull(),
  options: json("options").$type<string[]>().notNull(),
  correctAnswer: text("correct_answer").notNull(),
  explanation: text("explanation"),
  marks: integer("marks").notNull().default(1),
});

export const somaReports = pgTable("soma_reports", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => somaQuizzes.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  score: integer("score").notNull(),
  aiFeedbackHtml: text("ai_feedback_html"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const somaQuizzesRelations = relations(somaQuizzes, ({ many }) => ({
  questions: many(somaQuestions),
  reports: many(somaReports),
}));

export const somaQuestionsRelations = relations(somaQuestions, ({ one }) => ({
  quiz: one(somaQuizzes, {
    fields: [somaQuestions.quizId],
    references: [somaQuizzes.id],
  }),
}));

export const somaReportsRelations = relations(somaReports, ({ one }) => ({
  quiz: one(somaQuizzes, {
    fields: [somaReports.quizId],
    references: [somaQuizzes.id],
  }),
}));

export const insertSomaQuizSchema = createInsertSchema(somaQuizzes).omit({ id: true, createdAt: true });
export const insertSomaQuestionSchema = createInsertSchema(somaQuestions).omit({ id: true });
export const insertSomaReportSchema = createInsertSchema(somaReports).omit({ id: true, createdAt: true });

export type SomaQuiz = typeof somaQuizzes.$inferSelect;
export type InsertSomaQuiz = z.infer<typeof insertSomaQuizSchema>;
export type SomaQuestion = typeof somaQuestions.$inferSelect;
export type InsertSomaQuestion = z.infer<typeof insertSomaQuestionSchema>;
export type SomaReport = typeof somaReports.$inferSelect;
export type InsertSomaReport = z.infer<typeof insertSomaReportSchema>;
