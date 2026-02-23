import type { Express, NextFunction, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { questionUploadSchema, submissions as submissionsTable } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.resolve(process.cwd(), "client/public/uploads");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      cb(new Error("Only PNG, JPEG, WEBP, and SVG images are allowed"));
      return;
    }
    cb(null, true);
  },
});

const pdfUpload = multer({ storage: multer.memoryStorage() });

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}


const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Chomukamba";
const adminSessions = new Set<string>();

function parseCookies(req: Request) {
  const raw = req.headers.cookie;
  if (!raw) return {} as Record<string, string>;
  return raw.split(";").reduce<Record<string, string>>((acc, pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = decodeURIComponent(pair.slice(idx + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function getAdminSessionToken(req: Request) {
  return parseCookies(req)[ADMIN_COOKIE_NAME] || "";
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getAdminSessionToken(req);
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}


function extractJsonArray(text: string): any[] | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray((parsed as { questions?: unknown }).questions)) {
      return (parsed as { questions: any[] }).questions;
    }
    return [parsed];
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return null;
    }
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post("/api/admin/login", async (req, res) => {
    const { password } = req.body;
    if (String(password || "") !== ADMIN_PASSWORD) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }
    const token = crypto.randomBytes(24).toString("hex");
    adminSessions.add(token);
    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
      path: "/",
    });
    res.json({ authenticated: true });
  });

  app.get("/api/admin/session", async (req, res) => {
    const token = getAdminSessionToken(req);
    res.json({ authenticated: Boolean(token && adminSessions.has(token)) });
  });

  app.post("/api/admin/logout", async (req, res) => {
    const token = getAdminSessionToken(req);
    if (token) adminSessions.delete(token);
    res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });

  app.use("/api/admin", requireAdmin);
  app.get("/api/quizzes", async (_req, res) => {
    const quizzes = await storage.getQuizzes();
    res.json(quizzes);
  });

  app.get("/api/quizzes/:id", async (req, res) => {
    const quiz = await storage.getQuiz(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  });

  app.get("/api/quizzes/:id/questions", async (req, res) => {
    const quizId = parseInt(req.params.id);
    const quiz = await storage.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    const qs = await storage.getQuestionsByQuizId(quizId);
    const sanitized = qs.map(({ correctAnswer, ...rest }) => rest);
    res.json(sanitized);
  });

  app.post("/api/students", async (req, res) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ message: "First and last name required" });
    const existing = await storage.findStudentByName(firstName, lastName);
    if (existing) return res.json(existing);
    const student = await storage.createStudent({ firstName, lastName });
    res.json(student);
  });

  app.post("/api/check-submission", async (req, res) => {
    const { quizId, firstName, lastName } = req.body;
    if (!quizId || !firstName || !lastName) {
      return res.status(400).json({ message: "quizId, firstName, and lastName required" });
    }
    const quiz = await storage.getQuiz(Number(quizId));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    const hasSubmitted = await storage.checkStudentSubmission(quizId, firstName, lastName);
    if (hasSubmitted) {
      const submission = await storage.getStudentSubmission(quizId, firstName, lastName);
      return res.json({ hasSubmitted: true, totalScore: submission?.totalScore ?? 0, maxPossibleScore: submission?.maxPossibleScore ?? 0 });
    }
    res.json({ hasSubmitted: false });
  });

  app.post("/api/submissions", async (req, res) => {
    const { studentId, quizId, answers } = req.body;
    if (!studentId || !quizId) return res.status(400).json({ message: "studentId and quizId required" });

    const allQuestions = await storage.getQuestionsByQuizId(quizId);
    let totalScore = 0;
    let maxPossibleScore = 0;
    const answersBreakdown: Record<string, { answer: string; correct: boolean; marksEarned: number }> = {};

    for (const q of allQuestions) {
      maxPossibleScore += q.marksWorth;
      const studentAnswer = answers?.[q.id] ?? "";
      const isCorrect = studentAnswer === q.correctAnswer;
      const marksEarned = isCorrect ? q.marksWorth : 0;
      totalScore += marksEarned;
      answersBreakdown[String(q.id)] = {
        answer: studentAnswer,
        correct: isCorrect,
        marksEarned,
      };
    }

    const submission = await storage.createSubmission({
      studentId,
      quizId,
      totalScore,
      maxPossibleScore,
      answersBreakdown,
    });

    res.json(submission);
  });

  app.get("/api/admin/quizzes", async (_req, res) => {
    const quizzes = await storage.getQuizzes();
    res.json(quizzes);
  });

  app.get("/api/admin/quizzes/:id", async (req, res) => {
    const quiz = await storage.getQuiz(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  });

  app.post("/api/admin/quizzes", async (req, res) => {
    const { title, timeLimitMinutes, dueDate } = req.body;
    if (!title || !timeLimitMinutes || !dueDate) {
      return res.status(400).json({ message: "title, timeLimitMinutes, and dueDate required" });
    }
    const quiz = await storage.createQuiz({
      title,
      timeLimitMinutes,
      dueDate: new Date(dueDate),
    });
    res.json(quiz);
  });

  app.delete("/api/admin/quizzes/:id", async (req, res) => {
    await storage.deleteQuiz(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/admin/quizzes/:id/questions", async (req, res) => {
    const questions = await storage.getQuestionsByQuizId(parseInt(req.params.id));
    res.json(questions);
  });

  app.post("/api/admin/quizzes/:id/questions", async (req, res) => {
    const quizId = parseInt(req.params.id);
    const quiz = await storage.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const { questions: rawQuestions } = req.body;
    const parsed = questionUploadSchema.safeParse(rawQuestions);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid question format", errors: parsed.error.errors });
    }

    const toInsert = parsed.data.map((q) => ({
      quizId,
      promptText: q.prompt_text,
      imageUrl: q.image_url ?? null,
      options: q.options,
      correctAnswer: q.correct_answer,
      marksWorth: q.marks_worth,
    }));

    const created = await storage.createQuestions(toInsert);
    res.json(created);
  });

  app.delete("/api/admin/questions/:id", async (req, res) => {
    await storage.deleteQuestion(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/admin/quizzes/:id/submissions", async (req, res) => {
    const submissions = await storage.getSubmissionsByQuizId(parseInt(req.params.id));
    res.json(submissions);
  });

  app.delete("/api/admin/submissions/:id", async (req, res) => {
    await storage.deleteSubmission(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.delete("/api/admin/quizzes/:id/submissions", async (req, res) => {
    await storage.deleteSubmissionsByQuizId(parseInt(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/generate-questions", requireAdmin, pdfUpload.single("pdf"), async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    req.setTimeout(120_000);
    res.setTimeout(120_000);

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 10_000);
    let clientDisconnected = false;
    req.on("close", () => {
      clientDisconnected = true;
      clearInterval(heartbeat);
    });

    try {
      if (!req.file) {
        sendEvent("error", { message: "No PDF file uploaded" });
        clearInterval(heartbeat);
        res.end();
        return;
      }

      const base64Pdf = req.file.buffer.toString("base64");

      // --- STAGE 1: Gemini extracts raw text from PDF ---
      sendEvent("stage", { stage: 1, label: "Gemini is reading the PDF..." });
      const geminiModel = getGeminiModel();
      const geminiResult = await geminiModel.generateContent([
        { text: "Extract all multiple-choice mathematics questions, options, and text from this PDF document. Output only the raw extracted text, preserving all mathematical notation exactly as written." },
        { inlineData: { mimeType: "application/pdf", data: base64Pdf } },
      ]);
      const extractedText = geminiResult.response.text();
      if (!extractedText || extractedText.trim().length < 20) {
        sendEvent("error", { message: "Gemini could not extract meaningful text from the PDF" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      sendEvent("stage_done", { stage: 1 });
      if (clientDisconnected) { clearInterval(heartbeat); res.end(); return; }

      // --- STAGE 2: DeepSeek solves the mathematics ---
      sendEvent("stage", { stage: 2, label: "DeepSeek is solving the mathematics..." });
      const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
      if (!deepseekApiKey) {
        sendEvent("error", { message: "DEEPSEEK_API_KEY is not configured" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      const deepseek = new OpenAI({ apiKey: deepseekApiKey, baseURL: "https://api.deepseek.com" });
      const deepseekResult = await deepseek.chat.completions.create({
        model: "deepseek-reasoner",
        messages: [
          { role: "user", content: `You are an elite mathematician. Below are multiple-choice questions extracted from a past mathematics exam paper. For EACH question:\n1. Show the step-by-step mathematical working.\n2. Identify the strictly correct option letter and its full text.\n3. Assign appropriate marks (1-5) based on difficulty.\n\nExtracted text:\n${extractedText}` },
        ],
      });
      const solvedText = deepseekResult.choices[0]?.message?.content || "";
      if (!solvedText || solvedText.trim().length < 20) {
        sendEvent("error", { message: "DeepSeek did not return valid solutions" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      sendEvent("stage_done", { stage: 2 });
      if (clientDisconnected) { clearInterval(heartbeat); res.end(); return; }

      // --- STAGE 3: Claude formats into LaTeX ---
      sendEvent("stage", { stage: 3, label: "Claude is formatting the LaTeX..." });
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicApiKey) {
        sendEvent("error", { message: "ANTHROPIC_API_KEY is not configured" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const claudeResult = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [
          { role: "user", content: `Take this mathematical working and question data. Your job is to restructure it into a list of multiple-choice questions. For each question, format ALL mathematical formulas, numbers, and equations into strict LaTeX syntax. You MUST double-escape all backslashes (e.g., \\\\frac, \\\\sqrt, \\\\times) because the output will be embedded inside a JSON string.\n\nFor each question output:\n- prompt_text: The question text with double-escaped LaTeX\n- options: Array of option strings with double-escaped LaTeX\n- correct_answer: The full text of the correct option with double-escaped LaTeX\n- marks_worth: Integer marks value\n\nOutput a structured list, one question per block. Do NOT output JSON yet — just clearly structured text with the four fields per question.\n\nMath data:\n${solvedText}` },
        ],
      });
      const formattedText = claudeResult.content[0].type === "text" ? claudeResult.content[0].text : "";
      if (!formattedText || formattedText.trim().length < 20) {
        sendEvent("error", { message: "Claude did not return formatted content" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      sendEvent("stage_done", { stage: 3 });
      if (clientDisconnected) { clearInterval(heartbeat); res.end(); return; }

      // --- STAGE 4: GPT-4o validates into strict JSON ---
      sendEvent("stage", { stage: 4, label: "ChatGPT is validating the database schema..." });
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        sendEvent("error", { message: "OPENAI_API_KEY is not configured" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const gptResult = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a backend JSON inspector. Your ONLY job is to convert the input into a perfectly valid JSON array. Return ONLY the raw JSON array — no markdown, no code fences, no explanation." },
          { role: "user", content: `Convert this structured question data into a strict JSON array matching this exact schema:\n[{ "prompt_text": string, "options": [string, string, string, string], "correct_answer": string, "marks_worth": number }]\n\nRules:\n- Every LaTeX backslash must be double-escaped (\\\\frac not \\frac)\n- The correct_answer must exactly match one of the options\n- marks_worth must be a positive integer\n- The JSON must be valid for JSON.parse()\n- Return ONLY the raw JSON array\n\nInput:\n${formattedText}` },
        ],
      });
      const gptOutput = gptResult.choices[0]?.message?.content || "";
      const questions = extractJsonArray(gptOutput);
      if (!questions || questions.length === 0) {
        sendEvent("error", { message: "GPT-4o could not produce valid JSON. Raw output logged to server." });
        console.error("GPT-4o raw output:", gptOutput);
        clearInterval(heartbeat);
        res.end();
        return;
      }
      sendEvent("stage_done", { stage: 4 });

      sendEvent("result", { questions });
      clearInterval(heartbeat);
      res.end();
    } catch (err: any) {
      console.error("AI pipeline error:", err);
      sendEvent("error", { message: `AI pipeline failed: ${err.message}` });
      clearInterval(heartbeat);
      res.end();
    }
  });

  app.post("/api/admin/copilot-chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ message: "message is required" });

      const model = getGeminiModel();
      const prompt = `You are a curriculum assistant for mathematics teachers. Respond conversationally first, then include a strict JSON array of draft questions using this schema: [{ "prompt_text": string, "options": [string], "correct_answer": string, "marks_worth": number, "image_url": string | null }]. Use double-escaped LaTeX in all math strings.`;

      const result = await model.generateContent([{ text: prompt }, { text: String(message) }]);
      const raw = result.response.text();
      const drafts = extractJsonArray(raw) || [];
      res.json({ reply: raw, drafts });
    } catch (err: any) {
      res.status(500).json({ message: `Copilot failed: ${err.message}` });
    }
  });

  app.post("/api/analyze-student", requireAdmin, async (req, res) => {
    try {
      const { submission, questions } = req.body;
      if (!submission || !questions) {
        return res.status(400).json({ message: "submission and questions required" });
      }

      const model = getGeminiModel();
      let questionNumber = 0;
      const breakdown = Object.entries(submission.answersBreakdown).map(([qId, detail]: [string, any]) => {
        const question = questions.find((q: any) => String(q.id) === qId);
        questionNumber++;
        return {
          questionNumber: question?.displayNumber || questionNumber,
          question: question?.promptText || "Unknown",
          studentAnswer: detail.answer || "No answer",
          correct: detail.correct,
          marksEarned: detail.marksEarned,
          marksWorth: question?.marksWorth || 1,
        };
      });

      const prompt = `You are an expert mathematics tutor. Analyze this student's quiz submission and provide a detailed performance report.

Student scored ${submission.totalScore}/${submission.maxPossibleScore}.

IMPORTANT FORMATTING RULES:
1. Reference questions using their "questionNumber" field (e.g., "Question 1", "Question 2"), NOT their database IDs.
2. Format all "Areas of Improvement" and explanations as clean HTML bulleted lists using <ul> and <li> tags.
3. Use <h3> tags for section headings.
4. Be concise, specific, and actionable.
5. Output clean HTML only — no markdown, no code fences.

Sections to include:
- Overall Performance Summary
- Areas of Strength (concepts the student demonstrated well)
- Areas of Improvement (specific concepts to work on, as <ul><li> items)
- Recommended Next Steps (actionable study tips, as <ul><li> items)

Question breakdown:
${JSON.stringify(breakdown, null, 2)}`;

      const result = await model.generateContent(prompt);
      let html = result.response.text();
      html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      res.json({ analysis: html });
    } catch (err: any) {
      res.status(500).json({ message: `AI analysis failed: ${err.message}` });
    }
  });

  app.post("/api/analyze-class", requireAdmin, async (req, res) => {
    try {
      const { quizId } = req.body;
      if (!quizId) return res.status(400).json({ message: "quizId required" });

      const submissions = await storage.getSubmissionsByQuizId(Number(quizId));
      const questions = await storage.getQuestionsByQuizId(Number(quizId));
      const model = getGeminiModel();

      const payload = submissions.map((s) => ({
        student: `${s.student.firstName} ${s.student.lastName}`,
        totalScore: s.totalScore,
        maxPossibleScore: s.maxPossibleScore,
        answersBreakdown: s.answersBreakdown,
      }));

      const prompt = `You are a master mathematics tutor. Analyze this cohort's quiz data. Identify macro-trends, the most commonly failed questions, and the specific mathematical concepts the class as a whole is struggling with. Output in clean, professional HTML.\n\nQuestions:\n${JSON.stringify(questions, null, 2)}\n\nSubmissions:\n${JSON.stringify(payload, null, 2)}`;

      const result = await model.generateContent(prompt);
      let html = result.response.text();
      html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      res.json({ analysis: html, submissionCount: submissions.length });
    } catch (err: any) {
      res.status(500).json({ message: `Class analysis failed: ${err.message}` });
    }
  });

  app.post("/api/upload-image", requireAdmin, (req, res) => {
    upload.single("image")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "Image exceeds 5MB size limit" });
        }
        return res.status(400).json({ message: err.message || "Invalid image upload" });
      }
      if (!req.file) return res.status(400).json({ message: "No image uploaded" });
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    });
  });

  return httpServer;
}
