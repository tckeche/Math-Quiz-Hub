import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { generateWithFallback } from "./aiOrchestrator";

export const QuestionSchema = z.object({
  stem: z.string(),
  options: z.array(z.string()).length(4),
  correct_answer: z.string(),
  explanation: z.string().min(1),
  marks: z.number().int().min(1).max(10),
});

export const QuizResultSchema = z.object({
  questions: z.array(QuestionSchema).min(1),
});

export type QuizResult = z.infer<typeof QuizResultSchema>;
export interface SomaGenerationContext {
  topic: string;
  subject: string;
  syllabus: string;
  level: string;
  copilotPrompt?: string;
  supportingDocText?: string;
}

const jsonSchema = zodToJsonSchema(QuizResultSchema, "QuizResult");

function extractJson(raw: string): QuizResult {
  return QuizResultSchema.parse(JSON.parse(raw));
}

export async function parsePdfTextFromBuffer(buffer: Buffer): Promise<string> {
  const text = buffer.toString("latin1").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Unable to parse PDF text content");
  return text;
}

export async function fetchPaperContext(paperCode: string): Promise<string> {
  const query = encodeURIComponent(`${paperCode} past paper mark scheme pdf`);
  const html = await fetch(`https://duckduckgo.com/html/?q=${query}`).then((r) => r.text());
  return `Web search snippets for ${paperCode}:\n${html.slice(0, 6000)}`;
}

export async function generateAuditedQuiz(input: SomaGenerationContext | string): Promise<QuizResult> {
  const context: SomaGenerationContext = typeof input === "string"
    ? { topic: input, subject: "Mathematics", syllabus: "IEB", level: "Grade 6-12" }
    : input;

  const makerPrompt = `You are Claude (Maker), an expert mathematics assessment designer. Generate MCQ quiz JSON for ${context.subject}. Use syllabus ${context.syllabus} and level ${context.level}. Include explanation for each question describing why correct answer is right and why distractors are wrong.`;
  const checkerPrompt = `You are Gemini (Checker). Audit the Maker JSON for mathematical accuracy, formatting, and syllabus-level alignment (${context.syllabus}/${context.level}).`;
  const finalizerPrompt = `Perform final curriculum compliance and syllabus audit. Return strictly valid JSON only.`;

  const { data: maker } = await generateWithFallback(makerPrompt, `Topic: ${context.topic}\n${context.copilotPrompt || ""}\n${context.supportingDocText || ""}`, jsonSchema);
  const { data: checker } = await generateWithFallback(checkerPrompt, `Topic: ${context.topic}\nInput JSON:\n${maker}`, jsonSchema);
  const { data: final } = await generateWithFallback(finalizerPrompt, `Topic: ${context.topic}\nInput JSON:\n${checker}`, jsonSchema);
  return extractJson(final);
}
