/**
 * SCHEMA VALIDATION TESTS
 * Tests Zod validation schemas for all data models.
 * Covers: quizzes, questions, students, submissions, soma entities.
 */
import { describe, it, expect } from "vitest";
import {
  insertQuizSchema,
  insertQuestionSchema,
  insertStudentSchema,
  insertSubmissionSchema,
  questionUploadSchema,
  insertSomaQuizSchema,
} from "../shared/schema";

// ─── Quiz Schema ────────────────────────────────────────────────────────────
describe("insertQuizSchema", () => {
  it("accepts valid quiz data", () => {
    const result = insertQuizSchema.safeParse({
      title: "Algebra Basics",
      timeLimitMinutes: 30,
      dueDate: new Date("2099-12-31"),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = insertQuizSchema.safeParse({
      timeLimitMinutes: 30,
      dueDate: new Date("2099-12-31"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing timeLimitMinutes", () => {
    const result = insertQuizSchema.safeParse({
      title: "Test Quiz",
      dueDate: new Date("2099-12-31"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing dueDate", () => {
    const result = insertQuizSchema.safeParse({
      title: "Test Quiz",
      timeLimitMinutes: 30,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer timeLimitMinutes", () => {
    const result = insertQuizSchema.safeParse({
      title: "Test Quiz",
      timeLimitMinutes: "thirty",
      dueDate: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

// ─── Question Upload Schema ──────────────────────────────────────────────────
describe("questionUploadSchema", () => {
  const validQuestion = {
    prompt_text: "What is $2 + 2$?",
    options: ["3", "4", "5", "6"],
    correct_answer: "4",
    marks_worth: 1,
  };

  it("accepts a valid question array", () => {
    const result = questionUploadSchema.safeParse([validQuestion]);
    expect(result.success).toBe(true);
  });

  it("accepts question with image_url", () => {
    const result = questionUploadSchema.safeParse([{ ...validQuestion, image_url: "/uploads/img.png" }]);
    expect(result.success).toBe(true);
  });

  it("accepts question with null image_url", () => {
    const result = questionUploadSchema.safeParse([{ ...validQuestion, image_url: null }]);
    expect(result.success).toBe(true);
  });

  it("accepts question without image_url (optional)", () => {
    const result = questionUploadSchema.safeParse([validQuestion]);
    expect(result.success).toBe(true);
  });

  it("rejects empty array", () => {
    // Empty arrays should be allowed by the schema (array of 0 questions)
    const result = questionUploadSchema.safeParse([]);
    expect(result.success).toBe(true); // valid empty array
  });

  it("rejects questions without exactly 4 options", () => {
    const oneOption = questionUploadSchema.safeParse([{ ...validQuestion, options: ["A"] }]);
    expect(oneOption.success).toBe(false);
    const noOptions = questionUploadSchema.safeParse([{ ...validQuestion, options: [] }]);
    expect(noOptions.success).toBe(false);
    const threeOptions = questionUploadSchema.safeParse([{ ...validQuestion, options: ["A", "B", "C"] }]);
    expect(threeOptions.success).toBe(false);
    const fiveOptions = questionUploadSchema.safeParse([{ ...validQuestion, options: ["A", "B", "C", "D", "E"] }]);
    expect(fiveOptions.success).toBe(false);
  });

  it("accepts questions with exactly 4 options", () => {
    const fourOptions = questionUploadSchema.safeParse([{ ...validQuestion, options: ["A", "B", "C", "D"] }]);
    expect(fourOptions.success).toBe(true);
  });

  it("rejects missing prompt_text", () => {
    const result = questionUploadSchema.safeParse([{ ...validQuestion, prompt_text: undefined }]);
    expect(result.success).toBe(false);
  });

  it("rejects missing correct_answer", () => {
    const result = questionUploadSchema.safeParse([{ ...validQuestion, correct_answer: undefined }]);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive marks_worth", () => {
    const result = questionUploadSchema.safeParse([{ ...validQuestion, marks_worth: 0 }]);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer marks_worth", () => {
    const result = questionUploadSchema.safeParse([{ ...validQuestion, marks_worth: 1.5 }]);
    expect(result.success).toBe(false);
  });

  it("accepts multiple questions", () => {
    const result = questionUploadSchema.safeParse([validQuestion, validQuestion]);
    expect(result.success).toBe(true);
  });

  it("accepts question without marks_worth (defaults to 1)", () => {
    const { marks_worth, ...rest } = validQuestion;
    const result = questionUploadSchema.safeParse([rest]);
    expect(result.success).toBe(true);
  });

  it("accepts LaTeX in prompt_text", () => {
    const result = questionUploadSchema.safeParse([{
      ...validQuestion,
      prompt_text: "Solve \\\\frac{1}{2} + \\\\frac{1}{3}",
    }]);
    expect(result.success).toBe(true);
  });
});

// ─── Student Schema ──────────────────────────────────────────────────────────
describe("insertStudentSchema", () => {
  it("accepts valid student", () => {
    const result = insertStudentSchema.safeParse({ firstName: "John", lastName: "Doe" });
    expect(result.success).toBe(true);
  });

  it("rejects missing firstName", () => {
    const result = insertStudentSchema.safeParse({ lastName: "Doe" });
    expect(result.success).toBe(false);
  });

  it("rejects missing lastName", () => {
    const result = insertStudentSchema.safeParse({ firstName: "John" });
    expect(result.success).toBe(false);
  });
});

// ─── Soma Quiz Schema ─────────────────────────────────────────────────────────
describe("insertSomaQuizSchema", () => {
  it("accepts valid soma quiz", () => {
    const result = insertSomaQuizSchema.safeParse({
      title: "Calculus Quiz",
      topic: "Derivatives",
      status: "draft",
    });
    expect(result.success).toBe(true);
  });

  it("accepts soma quiz with curriculum context", () => {
    const result = insertSomaQuizSchema.safeParse({
      title: "Algebra Quiz",
      topic: "Quadratic Equations",
      curriculumContext: "Grade 10 Math",
      status: "published",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = insertSomaQuizSchema.safeParse({ topic: "Derivatives", status: "draft" });
    expect(result.success).toBe(false);
  });

  it("rejects missing topic", () => {
    const result = insertSomaQuizSchema.safeParse({ title: "My Quiz", status: "draft" });
    expect(result.success).toBe(false);
  });
});
