import { db } from "./db";
import { quizzes, questions } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const existing = await db.select({ count: sql<number>`count(*)` }).from(quizzes);
  if (Number(existing[0].count) > 0) return;

  const [quiz1] = await db.insert(quizzes).values({
    title: "Pure Mathematics — Paper 1",
    timeLimitMinutes: 45,
    dueDate: new Date("2026-06-30T23:59:00"),
  }).returning();

  const [quiz2] = await db.insert(quizzes).values({
    title: "Statistics & Probability — Paper 2",
    timeLimitMinutes: 30,
    dueDate: new Date("2026-07-15T23:59:00"),
  }).returning();

  await db.insert(questions).values([
    {
      quizId: quiz1.id,
      promptText: "Solve the equation \\(x^2 - 5x + 6 = 0\\).",
      options: ["\\(x = 1, 6\\)", "\\(x = 2, 3\\)", "\\(x = -2, -3\\)", "\\(x = -1, 6\\)"],
      correctAnswer: "\\(x = 2, 3\\)",
      marksWorth: 3,
    },
    {
      quizId: quiz1.id,
      promptText: "Find \\(\\frac{d}{dx}(3x^3 - 2x^2 + 7x - 4)\\).",
      options: ["\\(9x^2 - 4x + 7\\)", "\\(9x^2 - 2x + 7\\)", "\\(3x^2 - 4x + 7\\)", "\\(9x^3 - 4x^2 + 7\\)"],
      correctAnswer: "\\(9x^2 - 4x + 7\\)",
      marksWorth: 4,
    },
    {
      quizId: quiz1.id,
      promptText: "Evaluate \\(\\int_0^2 (2x + 1)\\,dx\\).",
      options: ["\\(5\\)", "\\(6\\)", "\\(7\\)", "\\(8\\)"],
      correctAnswer: "\\(6\\)",
      marksWorth: 4,
    },
    {
      quizId: quiz1.id,
      promptText: "The first three terms of a geometric sequence are \\(2, 6, 18\\). Find the 5th term.",
      options: ["\\(54\\)", "\\(162\\)", "\\(486\\)", "\\(108\\)"],
      correctAnswer: "\\(162\\)",
      marksWorth: 3,
    },
    {
      quizId: quiz1.id,
      promptText: "Find the equation of the line passing through \\((1, 3)\\) and \\((4, 9)\\).",
      options: ["\\(y = 2x + 1\\)", "\\(y = 3x\\)", "\\(y = 2x + 3\\)", "\\(y = x + 2\\)"],
      correctAnswer: "\\(y = 2x + 1\\)",
      marksWorth: 3,
    },
    {
      quizId: quiz2.id,
      promptText: "A fair six-sided die is rolled once. What is the probability of getting an even number?",
      options: ["\\(\\frac{1}{6}\\)", "\\(\\frac{1}{3}\\)", "\\(\\frac{1}{2}\\)", "\\(\\frac{2}{3}\\)"],
      correctAnswer: "\\(\\frac{1}{2}\\)",
      marksWorth: 2,
    },
    {
      quizId: quiz2.id,
      promptText: "The mean of the data set \\(\\{4, 7, 10, 13, 16\\}\\) is:",
      options: ["\\(8\\)", "\\(9\\)", "\\(10\\)", "\\(11\\)"],
      correctAnswer: "\\(10\\)",
      marksWorth: 2,
    },
    {
      quizId: quiz2.id,
      promptText: "If \\(P(A) = 0.3\\) and \\(P(B) = 0.5\\), and \\(A\\) and \\(B\\) are independent, find \\(P(A \\cap B)\\).",
      options: ["\\(0.15\\)", "\\(0.80\\)", "\\(0.20\\)", "\\(0.35\\)"],
      correctAnswer: "\\(0.15\\)",
      marksWorth: 3,
    },
    {
      quizId: quiz2.id,
      promptText: "The standard deviation of the data set \\(\\{2, 4, 4, 4, 5, 5, 7, 9\\}\\) is approximately:",
      options: ["\\(1.5\\)", "\\(2.0\\)", "\\(2.5\\)", "\\(3.0\\)"],
      correctAnswer: "\\(2.0\\)",
      marksWorth: 3,
    },
  ]);

  console.log("Database seeded with sample quizzes and questions.");
}
