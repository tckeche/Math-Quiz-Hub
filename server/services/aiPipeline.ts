import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { generateWithFallback } from "./aiOrchestrator";

export const QuestionSchema = z.object({
  stem: z.string().describe("The question text, may include LaTeX notation"),
  options: z.array(z.string()).min(4).max(4).describe("Exactly 4 answer choices"),
  correct_answer: z.string().describe("The correct answer, must match one of the options exactly"),
  explanation: z.string().describe("A brief explanation of why the correct answer is right"),
  marks: z.number().int().min(1).max(10).describe("Mark value for this question"),
});

export const QuizResultSchema = z.object({
  questions: z.array(QuestionSchema).min(1).describe("Array of quiz questions"),
});

export type QuizResult = z.infer<typeof QuizResultSchema>;

const jsonSchema = zodToJsonSchema(QuizResultSchema, "QuizResult");

async function step1Generate(topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 1: Generating initial quiz...");

  const systemPrompt = `You are an expert mathematics assessment designer. Generate quizzes of high-quality multiple-choice questions. Return a JSON object with a "questions" array matching this schema: ${JSON.stringify(jsonSchema)}`;

  const userPrompt = `Generate a quiz of 5 high-quality multiple-choice questions on the topic: "${topic}".

Requirements:
- Each question must have exactly 4 options (A, B, C, D format in the text but just the answer values in the array)
- Include LaTeX notation where appropriate using \\( \\) for inline math
- Provide clear, educational explanations
- Vary difficulty levels across questions
- Assign marks between 1-5 based on difficulty
- Ensure correct_answer exactly matches one of the options`;

  const raw = await generateWithFallback(systemPrompt, userPrompt, jsonSchema);
  const parsed = QuizResultSchema.parse(JSON.parse(raw));
  console.log(`[SOMA Pipeline] Step 1 complete: ${parsed.questions.length} questions generated`);
  return parsed;
}

async function step2Audit(claudeResult: QuizResult, topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 2: Auditing mathematical accuracy...");

  const systemPrompt = `You are a rigorous mathematics auditor. Review quiz questions for mathematical accuracy and return corrected data as a JSON object with a "questions" array matching this schema: ${JSON.stringify(jsonSchema)}`;

  const userPrompt = `Review the following quiz questions on "${topic}" for mathematical accuracy.

For each question:
1. Verify the correct_answer is actually correct by solving the problem
2. Fix any mathematical errors in the stem, options, or explanation
3. Ensure LaTeX notation is properly formatted
4. Keep the same structure but improve quality where needed

Quiz data:
${JSON.stringify(claudeResult)}`;

  const raw = await generateWithFallback(systemPrompt, userPrompt, jsonSchema);
  const parsed = QuizResultSchema.parse(JSON.parse(raw));
  console.log(`[SOMA Pipeline] Step 2 complete: ${parsed.questions.length} questions audited`);
  return parsed;
}

async function step3SyllabusAudit(deepseekResult: QuizResult, topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 3: Final syllabus audit...");

  const systemPrompt = `You are a curriculum alignment specialist. Review mathematics quizzes for syllabus compliance and pedagogical quality. Return the audited quiz as a JSON object with a "questions" array matching this schema: ${JSON.stringify(jsonSchema)}`;

  const userPrompt = `Review this mathematics quiz on "${topic}" for syllabus compliance and pedagogical quality.

For each question:
1. Ensure it aligns with standard mathematics curricula
2. Verify the explanation is clear and educational
3. Check that difficulty progression makes sense
4. Ensure LaTeX formatting is clean and consistent
5. Confirm marks allocation is fair

Input quiz:
${JSON.stringify(deepseekResult)}`;

  const raw = await generateWithFallback(systemPrompt, userPrompt, jsonSchema);
  const parsed = QuizResultSchema.parse(JSON.parse(raw));
  console.log(`[SOMA Pipeline] Step 3 complete: ${parsed.questions.length} questions finalized`);
  return parsed;
}

export async function generateAuditedQuiz(topic: string): Promise<QuizResult> {
  console.log(`[SOMA Pipeline] Starting multi-agent pipeline for topic: "${topic}"`);

  const generated = await step1Generate(topic);
  const audited = await step2Audit(generated, topic);
  const finalized = await step3SyllabusAudit(audited, topic);

  console.log("[SOMA Pipeline] Pipeline complete!");
  return finalized;
}
