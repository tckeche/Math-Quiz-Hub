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

  const systemPrompt = `You are an elite Cambridge and IB examiner. You MUST generate ONLY Multiple Choice Questions (MCQs). Every single question must have EXACTLY 4 options formatted as an array of strings. You must compute 1 correct answer, and 3 highly plausible 'distractors'. Distractors MUST be based on common student errors (e.g., missed unit conversions, wrong signs, partial completion of a formula). NEVER generate open-ended questions. NEVER provide fewer or more than 4 options.

Return a JSON object with a "questions" array matching this schema: ${JSON.stringify(jsonSchema)}

CRITICAL FORMATTING RULES:
- You MUST format all math using standard LaTeX enclosed in $ for inline and $$ for block math.
- Format all programming code using standard markdown code blocks with the language specified (e.g. \`\`\`python).
- Use markdown formatting (bold, lists, etc.) where appropriate for clarity.`;

  const userPrompt = `Generate a quiz of 5 high-quality multiple-choice questions on the topic: "${topic}".

Requirements:
- Each question must have exactly 4 options (A, B, C, D format in the text but just the answer values in the array)
- Include LaTeX notation where appropriate using $ for inline math and $$ for block math
- Provide clear, educational explanations
- Vary difficulty levels across questions
- Assign marks between 1-5 based on difficulty
- Ensure correct_answer exactly matches one of the options`;

  const { data } = await generateWithFallback(systemPrompt, userPrompt, jsonSchema);
  const parsed = QuizResultSchema.parse(JSON.parse(data));
  console.log(`[SOMA Pipeline] Step 1 complete: ${parsed.questions.length} questions generated`);
  return parsed;
}

async function step2Audit(claudeResult: QuizResult, topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 2: Auditing mathematical accuracy...");

  const systemPrompt = `You are a rigorous mathematics auditor. Review quiz questions for mathematical accuracy and return corrected data as a JSON object with a "questions" array matching this schema: ${JSON.stringify(jsonSchema)}

CRITICAL FORMATTING RULES:
- You MUST format all math using standard LaTeX enclosed in $ for inline and $$ for block math.
- Format all programming code using standard markdown code blocks with the language specified (e.g. \`\`\`python).
- Use markdown formatting (bold, lists, etc.) where appropriate for clarity.`;

  const userPrompt = `Review the following quiz questions on "${topic}" for mathematical accuracy.

For each question:
1. Verify the correct_answer is actually correct by solving the problem
2. Fix any mathematical errors in the stem, options, or explanation
3. Ensure LaTeX notation uses $ for inline math and $$ for block math (NOT \\( \\) or \\[ \\])
4. Keep the same structure but improve quality where needed

Quiz data:
${JSON.stringify(claudeResult)}`;

  const { data } = await generateWithFallback(systemPrompt, userPrompt, jsonSchema);
  const parsed = QuizResultSchema.parse(JSON.parse(data));
  console.log(`[SOMA Pipeline] Step 2 complete: ${parsed.questions.length} questions audited`);
  return parsed;
}

async function step3SyllabusAudit(deepseekResult: QuizResult, topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 3: Final syllabus audit...");

  const systemPrompt = `You are a curriculum alignment specialist. Review mathematics quizzes for syllabus compliance and pedagogical quality. Return the audited quiz as a JSON object with a "questions" array matching this schema: ${JSON.stringify(jsonSchema)}

CRITICAL FORMATTING RULES:
- You MUST format all math using standard LaTeX enclosed in $ for inline and $$ for block math.
- Format all programming code using standard markdown code blocks with the language specified (e.g. \`\`\`python).
- Use markdown formatting (bold, lists, etc.) where appropriate for clarity.`;

  const userPrompt = `Review this mathematics quiz on "${topic}" for syllabus compliance and pedagogical quality.

For each question:
1. Ensure it aligns with standard mathematics curricula
2. Verify the explanation is clear and educational
3. Check that difficulty progression makes sense
4. Ensure LaTeX formatting uses $ for inline math and $$ for block math (NOT \\( \\) or \\[ \\])
5. Confirm marks allocation is fair

Input quiz:
${JSON.stringify(deepseekResult)}`;

  const { data } = await generateWithFallback(systemPrompt, userPrompt, jsonSchema);
  const parsed = QuizResultSchema.parse(JSON.parse(data));
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
