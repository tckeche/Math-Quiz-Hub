import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

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

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  return new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
}

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          questions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                stem: { type: SchemaType.STRING },
                options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                correct_answer: { type: SchemaType.STRING },
                explanation: { type: SchemaType.STRING },
                marks: { type: SchemaType.INTEGER },
              },
              required: ["stem", "options", "correct_answer", "explanation", "marks"],
            },
          },
        },
        required: ["questions"],
      },
    },
  });
}

async function step1Claude(topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 1: Claude 3.5 Sonnet - Generating initial quiz...");
  const client = getAnthropicClient();

  const toolDefinition = {
    name: "submit_quiz",
    description: "Submit a generated mathematics quiz with structured questions",
    input_schema: jsonSchema.definitions?.QuizResult ?? jsonSchema,
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    tools: [toolDefinition as any],
    tool_choice: { type: "tool" as const, name: "submit_quiz" },
    messages: [
      {
        role: "user",
        content: `You are an expert mathematics assessment designer. Generate a quiz of 5 high-quality multiple-choice questions on the topic: "${topic}".

Requirements:
- Each question must have exactly 4 options (A, B, C, D format in the text but just the answer values in the array)
- Include LaTeX notation where appropriate using \\( \\) for inline math
- Provide clear, educational explanations
- Vary difficulty levels across questions
- Assign marks between 1-5 based on difficulty
- Ensure correct_answer exactly matches one of the options

Call the submit_quiz tool with your generated quiz.`,
      },
    ],
  });

  const toolBlock = response.content.find((b: any) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block");
  }

  const parsed = QuizResultSchema.parse(toolBlock.input);
  console.log(`[SOMA Pipeline] Step 1 complete: ${parsed.questions.length} questions generated`);
  return parsed;
}

async function step2DeepSeek(claudeResult: QuizResult, topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 2: DeepSeek R1 - Auditing mathematical accuracy...");
  const client = getDeepSeekClient();

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: `You are a rigorous mathematics auditor. Review the following quiz questions on "${topic}" for mathematical accuracy.

For each question:
1. Verify the correct_answer is actually correct by solving the problem
2. Fix any mathematical errors in the stem, options, or explanation
3. Ensure LaTeX notation is properly formatted
4. Keep the same structure but improve quality where needed

Return the audited quiz in the exact same JSON schema format.`,
      },
      {
        role: "user",
        content: JSON.stringify(claudeResult),
      },
    ],
    response_format: {
      type: "json_schema" as any,
      json_schema: {
        name: "QuizResult",
        strict: true,
        schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  stem: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  correct_answer: { type: "string" },
                  explanation: { type: "string" },
                  marks: { type: "integer" },
                },
                required: ["stem", "options", "correct_answer", "explanation", "marks"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty response");

  const parsed = QuizResultSchema.parse(JSON.parse(content));
  console.log(`[SOMA Pipeline] Step 2 complete: ${parsed.questions.length} questions audited`);
  return parsed;
}

async function step3Gemini(deepseekResult: QuizResult, topic: string): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 3: Gemini 2.5 Flash - Final syllabus audit...");
  const model = getGeminiModel();

  const prompt = `You are a curriculum alignment specialist. Review this mathematics quiz on "${topic}" for syllabus compliance and pedagogical quality.

For each question:
1. Ensure it aligns with standard mathematics curricula
2. Verify the explanation is clear and educational
3. Check that difficulty progression makes sense
4. Ensure LaTeX formatting is clean and consistent
5. Confirm marks allocation is fair

Input quiz:
${JSON.stringify(deepseekResult)}

Return the final audited quiz.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON response. Raw output: " + text.slice(0, 200));
  }

  const parsed = QuizResultSchema.parse(rawJson);
  console.log(`[SOMA Pipeline] Step 3 complete: ${parsed.questions.length} questions finalized`);
  return parsed;
}

async function auditWithDeepSeekSyllabus(deepSeekLogicOutput: QuizResult): Promise<QuizResult> {
  console.log("[SOMA Pipeline] Step 3 Fallback: DeepSeek - Syllabus audit fallback...");
  const client = getDeepSeekClient();

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: `You are an expert Cambridge syllabus auditor. Output your response strictly in JSON format matching this exact schema: ${JSON.stringify(zodToJsonSchema(QuizResultSchema))}. Data to audit: ${JSON.stringify(deepSeekLogicOutput)}`,
      },
      {
        role: "user",
        content: `Review and finalize these quiz questions for syllabus compliance, pedagogical quality, clean LaTeX formatting, and fair marks allocation. Return the audited quiz as json.`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("DeepSeek syllabus fallback returned empty response");

  const parsed = QuizResultSchema.parse(JSON.parse(content));
  console.log(`[SOMA Pipeline] Step 3 Fallback complete: ${parsed.questions.length} questions finalized via DeepSeek`);
  return parsed;
}

export async function generateAuditedQuiz(topic: string): Promise<QuizResult> {
  console.log(`[SOMA Pipeline] Starting multi-agent pipeline for topic: "${topic}"`);

  const claudeResult = await step1Claude(topic);
  const deepseekResult = await step2DeepSeek(claudeResult, topic);

  let finalResult: QuizResult;
  try {
    finalResult = await step3Gemini(deepseekResult, topic);
  } catch (error: any) {
    console.warn(`[SOMA Pipeline] Gemini failed (${error?.message || "unknown error"}), falling back to DeepSeek...`);
    finalResult = await auditWithDeepSeekSyllabus(deepseekResult);
  }

  console.log("[SOMA Pipeline] Pipeline complete!");
  return finalResult;
}
