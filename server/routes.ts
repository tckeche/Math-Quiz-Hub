import type { Express, NextFunction, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { questionUploadSchema, submissions as submissionsTable, insertSomaQuizSchema, insertSomaUserSchema } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { generateAuditedQuiz } from "./services/aiPipeline";
import { generateWithFallback } from "./services/aiOrchestrator";

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

const supportingDocUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.resolve(process.cwd(), "supporting-docs");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for supporting docs
});

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}


const ADMIN_COOKIE_NAME = "admin_session";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD environment variable is required");
  return pw;
}

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
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    jwt.verify(token, getJwtSecret());
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});


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

async function runBackgroundGrading(
  reportId: number,
  questions: { id: number; stem: string; options: string[]; correctAnswer: string; marks: number }[],
  studentAnswers: Record<string, string>,
  totalScore: number,
  maxPossibleScore: number,
) {
  const GRADING_TIMEOUT_MS = 90_000;
  try {
    console.log(`[SOMA Grading] Starting background AI grading for report ${reportId}`);

    const breakdown = questions.map((q) => {
      const studentAnswer = studentAnswers[String(q.id)] || "(no answer)";
      const isCorrect = studentAnswer === q.correctAnswer;
      return `Q: ${q.stem}\nStudent Answer: ${studentAnswer}\nCorrect Answer: ${q.correctAnswer}\nResult: ${isCorrect ? "CORRECT" : "INCORRECT"} (${q.marks} marks)`;
    }).join("\n\n");

    const systemPrompt = `You are a mathematics tutor providing personalized feedback to a student. Analyze their quiz performance and provide actionable feedback in clean HTML format. Use <h3> for section headings, <ul>/<li> for lists, <p> for paragraphs, and <strong> for emphasis. Keep feedback encouraging yet specific about areas for improvement.`;

    const userPrompt = `Student scored ${totalScore}/${maxPossibleScore} (${Math.round((totalScore / maxPossibleScore) * 100)}%).

Here is the breakdown:

${breakdown}

Provide:
1. An overall performance summary
2. Specific strengths demonstrated
3. Areas needing improvement with concrete study suggestions
4. Encouragement and next steps`;

    const gradePromise = generateWithFallback(systemPrompt, userPrompt);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI grading timed out after 90 seconds")), GRADING_TIMEOUT_MS)
    );

    const { data } = await Promise.race([gradePromise, timeoutPromise]);

    await storage.updateSomaReport(reportId, {
      status: "completed",
      aiFeedbackHtml: data,
    });

    console.log(`[SOMA Grading] Report ${reportId} graded successfully`);
  } catch (err: any) {
    console.error(`[SOMA Grading] Failed for report ${reportId}:`, err.message || err);
    try {
      await storage.updateSomaReport(reportId, {
        status: "failed",
        aiFeedbackHtml: `<p>AI analysis failed: ${err.message || "Unknown error"}. Please contact your teacher or try again later.</p>`,
      });
    } catch (dbErr: any) {
      console.error(`[SOMA Grading] Failed to update report ${reportId} to failed status:`, dbErr.message);
    }
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post("/api/auth/sync", async (req, res) => {
    try {
      const { id, email, user_metadata } = req.body;
      if (!id || !email) {
        return res.status(400).json({ message: "Missing id or email" });
      }
      const parsed = insertSomaUserSchema.parse({
        id,
        email,
        displayName: user_metadata?.display_name || user_metadata?.full_name || email.split("@")[0],
      });
      const user = await storage.upsertSomaUser(parsed);
      res.json(user);
    } catch (err: any) {
      console.error("Auth sync error:", err);
      res.status(500).json({ message: err.message || "Failed to sync user" });
    }
  });

  app.get("/api/student/reports", async (req, res) => {
    try {
      const studentId = req.query.studentId as string;
      if (!studentId) return res.status(400).json({ message: "studentId required" });
      const reports = await storage.getSomaReportsByStudentId(studentId);
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch reports" });
    }
  });

  app.get("/api/student/submissions", async (req, res) => {
    try {
      const studentId = req.query.studentId as string;
      if (!studentId) return res.status(400).json({ message: "studentId required" });
      const subs = await storage.getSubmissionsByStudentUserId(studentId);
      res.json(subs);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch submissions" });
    }
  });

  app.post("/api/admin/login", loginLimiter, async (req, res) => {
    const { password } = req.body;
    if (String(password || "") !== getAdminPassword()) {
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }
    const token = jwt.sign({ role: "admin" }, getJwtSecret(), { expiresIn: "12h" });
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
    if (!token) return res.json({ authenticated: false });
    try {
      jwt.verify(token, getJwtSecret());
      res.json({ authenticated: true });
    } catch {
      res.json({ authenticated: false });
    }
  });

  app.post("/api/admin/logout", async (req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });

  // Student quiz review - returns questions with correct answers for completed quizzes
  app.get("/api/student/quiz-review", async (req, res) => {
    try {
      const quizId = Number(req.query.quizId);
      const firstName = req.query.firstName as string;
      const lastName = req.query.lastName as string;
      if (!quizId || !firstName || !lastName) {
        return res.status(400).json({ message: "quizId, firstName, and lastName required" });
      }
      const hasSubmitted = await storage.checkStudentSubmission(quizId, firstName, lastName);
      if (!hasSubmitted) {
        return res.status(403).json({ message: "No submission found for this student" });
      }
      const submission = await storage.getStudentSubmission(quizId, firstName, lastName);
      const questions = await storage.getQuestionsByQuizId(quizId);
      const quiz = await storage.getQuiz(quizId);
      res.json({ quiz, questions, submission });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch review data" });
    }
  });

  // Student AI analysis - accessible without admin auth
  app.post("/api/student/ai-analysis", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ message: "message is required" });

      const systemPrompt = `You are a comprehensive AI tutor. Analyze the student's complete academic performance and provide a detailed standing report in clean HTML format. Include sections for: Overall Academic Standing, Subject-by-Subject Breakdown, Critical Weak Areas, Personalized Study Plan, and Motivational Summary. Use <h2>, <h3>, <ul>, <li> tags. Output clean HTML only — no markdown, no code fences.`;

      const { data, metadata } = await generateWithFallback(systemPrompt, String(message));
      let reply = data.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      if (metadata) {
        reply += `<hr style="margin-top: 30px; border-color: #334155;"/><p style="font-size: 10px; color: #64748b; text-align: center; text-transform: uppercase; letter-spacing: 0.1em;">Generated by ${metadata.provider} (${metadata.model}) in ${(metadata.durationMs / 1000).toFixed(2)}s</p>`;
      }
      res.json({ reply, metadata });
    } catch (err: any) {
      res.status(500).json({ message: `Analysis failed: ${err.message}` });
    }
  });

  // Student endpoint: on-demand AI analysis for a specific quiz submission
  app.post("/api/student/analyze-quiz", async (req, res) => {
    try {
      const { quizId, firstName, lastName } = req.body;
      if (!quizId || !firstName || !lastName) {
        return res.status(400).json({ message: "quizId, firstName, and lastName required" });
      }
      const submission = await storage.getStudentSubmission(Number(quizId), firstName, lastName);
      if (!submission) {
        return res.status(404).json({ message: "No submission found" });
      }
      const questions = await storage.getQuestionsByQuizId(Number(quizId));
      const quiz = await storage.getQuiz(Number(quizId));

      let questionNumber = 0;
      const breakdown = Object.entries(submission.answersBreakdown).map(([qId, detail]: [string, any]) => {
        const question = questions.find((q: any) => String(q.id) === qId);
        questionNumber++;
        return {
          questionNumber: question?.id || questionNumber,
          question: question?.promptText || "Unknown",
          studentAnswer: detail.answer || "No answer",
          correct: detail.correct,
          marksEarned: detail.marksEarned,
          marksWorth: question?.marksWorth || 1,
        };
      });

      const systemPrompt = `You are an expert academic tutor. Analyze this student's quiz submission and provide a detailed performance report in clean HTML.

FORMATTING RULES:
1. Use <h3> tags for section headings.
2. Format lists as <ul><li> items.
3. Be concise, specific, and actionable.
4. Output clean HTML only — no markdown, no code fences.

Sections to include:
- Overall Performance Summary (score, percentage, standing)
- Areas of Strength (concepts demonstrated well)
- Areas of Improvement (specific concepts to work on, as bullet points)
- Recommended Next Steps (actionable study tips)`;

      const userPrompt = `Quiz: "${quiz?.title || "Quiz"}" (${quiz?.subject || "General"})
Student scored ${submission.totalScore}/${submission.maxPossibleScore}.

Question breakdown:
${JSON.stringify(breakdown, null, 2)}`;

      const { data, metadata } = await generateWithFallback(systemPrompt, userPrompt);
      let html = data.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      if (metadata) {
        html += `<hr style="margin-top: 30px; border-color: #334155;"/><p style="font-size: 10px; color: #64748b; text-align: center; text-transform: uppercase; letter-spacing: 0.1em;">Generated by ${metadata.provider} (${metadata.model}) in ${(metadata.durationMs / 1000).toFixed(2)}s</p>`;
      }
      res.json({ analysis: html, metadata });
    } catch (err: any) {
      res.status(500).json({ message: `Analysis failed: ${err.message}` });
    }
  });

  app.use("/api/admin", requireAdmin);

  // Upload supporting documents (PDFs) — stored on disk so copilot can reference them
  app.post("/api/admin/upload-supporting-doc", supportingDocUpload.single("pdf"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No PDF uploaded" });
    res.json({ id: req.file.filename, originalName: req.file.originalname });
  });

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
    const student = await storage.findOrCreateStudent({ firstName, lastName });
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
    const { studentId, quizId, answers, startTime } = req.body;
    if (!studentId || !quizId) return res.status(400).json({ message: "studentId and quizId required" });
    if (typeof startTime !== "number" || !Number.isFinite(startTime)) {
      return res.status(400).json({ message: "startTime is required" });
    }

    const quiz = await storage.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const now = Date.now();
    if (startTime > now + 5000) {
      return res.status(400).json({ message: "Submission rejected: invalid start time" });
    }
    const elapsed = (now - startTime) / 1000;
    const allowedSeconds = quiz.timeLimitMinutes * 60 + 30;
    if (elapsed > allowedSeconds) {
      return res.status(400).json({ message: "Submission rejected: time limit exceeded" });
    }

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
    const questions = await storage.getQuestionsByQuizId(quiz.id);
    res.json({ ...quiz, questions });
  });

  app.post("/api/admin/quizzes", async (req, res) => {
    const { title, timeLimitMinutes, dueDate, syllabus, level, subject } = req.body;
    if (!title || !timeLimitMinutes || !dueDate) {
      return res.status(400).json({ message: "title, timeLimitMinutes, and dueDate required" });
    }
    const quiz = await storage.createQuiz({
      title,
      timeLimitMinutes,
      dueDate: new Date(dueDate),
      syllabus: syllabus || null,
      level: level || null,
      subject: subject || null,
    });
    res.json(quiz);
  });

  app.put("/api/admin/quizzes/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const existing = await storage.getQuiz(id);
    if (!existing) return res.status(404).json({ message: "Quiz not found" });

    const { title, timeLimitMinutes, dueDate, syllabus, level, subject } = req.body;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (timeLimitMinutes !== undefined) updates.timeLimitMinutes = timeLimitMinutes;
    if (dueDate !== undefined) updates.dueDate = new Date(dueDate);
    if (syllabus !== undefined) updates.syllabus = syllabus || null;
    if (level !== undefined) updates.level = level || null;
    if (subject !== undefined) updates.subject = subject || null;

    const updated = await storage.updateQuiz(id, updates);
    res.json(updated);
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

  app.post("/api/admin/validate-quiz", requireAdmin, async (req, res) => {
    try {
      const { questions } = req.body;
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ message: "questions array is required" });
      }

      const systemPrompt = `You are a strict quiz quality auditor. Review the following quiz questions for:
1. CORRECTNESS: Is the correct_answer actually correct? Solve each problem step-by-step to verify.
2. CLARITY: Is the question text clear and unambiguous?
3. OPTIONS: Are all options plausible? Are there duplicate or obviously wrong distractors?
4. FORMATTING: Is LaTeX notation properly delimited with \\( \\) or \\[ \\]? Are units correct?
5. MARKS: Are marks allocated fairly based on difficulty?

Return a JSON object with this structure:
{
  "overall": "pass" | "warning" | "fail",
  "issues": [{ "questionIndex": number, "severity": "error" | "warning", "message": string }],
  "summary": string
}

If all questions are correct and well-formatted, return overall: "pass" with an empty issues array.`;

      const userPrompt = `Validate these quiz questions:\n${JSON.stringify(questions, null, 2)}`;

      const { data, metadata } = await generateWithFallback(systemPrompt, userPrompt);

      // Try to parse JSON from the response
      let validation;
      try {
        const jsonMatch = data.match(/\{[\s\S]*\}/);
        validation = jsonMatch ? JSON.parse(jsonMatch[0]) : { overall: "pass", issues: [], summary: data };
      } catch {
        validation = { overall: "pass", issues: [], summary: data };
      }

      res.json({ validation, metadata });
    } catch (err: any) {
      res.status(500).json({ message: `Validation failed: ${err.message}` });
    }
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
      // Emit extracted text so the client can feed it to the copilot as context
      sendEvent("extracted_text", { text: extractedText });
      if (clientDisconnected) { clearInterval(heartbeat); res.end(); return; }

      // --- STAGE 2: AI solves the mathematics (waterfall fallback) ---
      sendEvent("stage", { stage: 2, label: "AI is solving the mathematics..." });
      const { data: solvedText } = await generateWithFallback(
        `You are an elite mathematician. For EACH multiple-choice question extracted from a past mathematics exam paper:\n1. Show the step-by-step mathematical working.\n2. Identify the strictly correct option letter and its full text.\n3. Assign appropriate marks (1-5) based on difficulty.`,
        `Extracted text:\n${extractedText}`
      );
      if (!solvedText || solvedText.trim().length < 20) {
        sendEvent("error", { message: "AI did not return valid solutions" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      sendEvent("stage_done", { stage: 2 });
      if (clientDisconnected) { clearInterval(heartbeat); res.end(); return; }

      // --- STAGE 3: AI formats into LaTeX (waterfall fallback) ---
      sendEvent("stage", { stage: 3, label: "AI is formatting the LaTeX..." });
      const { data: formattedText } = await generateWithFallback(
        `You restructure mathematical working into multiple-choice questions. Format ALL mathematical formulas, numbers, and equations into strict LaTeX syntax. You MUST double-escape all backslashes (e.g., \\\\frac, \\\\sqrt, \\\\times) because the output will be embedded inside a JSON string.\n\nFor each question output:\n- prompt_text: The question text with double-escaped LaTeX\n- options: Array of option strings with double-escaped LaTeX\n- correct_answer: The full text of the correct option with double-escaped LaTeX\n- marks_worth: Integer marks value\n\nOutput a structured list, one question per block. Do NOT output JSON yet — just clearly structured text with the four fields per question.`,
        `Math data:\n${solvedText}`
      );
      if (!formattedText || formattedText.trim().length < 20) {
        sendEvent("error", { message: "AI did not return formatted content" });
        clearInterval(heartbeat);
        res.end();
        return;
      }
      sendEvent("stage_done", { stage: 3 });
      if (clientDisconnected) { clearInterval(heartbeat); res.end(); return; }

      // --- STAGE 4: AI validates into strict JSON (waterfall fallback) ---
      sendEvent("stage", { stage: 4, label: "AI is validating the database schema..." });
      const stage4Schema = {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                prompt_text: { type: "string" },
                options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                correct_answer: { type: "string" },
                marks_worth: { type: "integer" },
              },
              required: ["prompt_text", "options", "correct_answer", "marks_worth"],
            },
          },
        },
        required: ["questions"],
      };
      const { data: gptOutput } = await generateWithFallback(
        "You are a backend JSON inspector. Your ONLY job is to convert the input into a perfectly valid JSON object with a 'questions' array. Each question MUST have exactly 4 options — no more, no fewer. Return ONLY valid JSON — no markdown, no code fences, no explanation.",
        `Convert this structured question data into a JSON object with a "questions" array matching this schema:\n{ "questions": [{ "prompt_text": string, "options": [string, string, string, string], "correct_answer": string, "marks_worth": number }] }\n\nRules:\n- Every LaTeX backslash must be double-escaped (\\\\frac not \\frac)\n- The correct_answer must exactly match one of the options\n- marks_worth must be a positive integer\n- The JSON must be valid for JSON.parse()\n- Return ONLY the raw JSON object\n\nInput:\n${formattedText}`,
        stage4Schema
      );
      const questions = extractJsonArray(gptOutput);
      if (!questions || questions.length === 0) {
        sendEvent("error", { message: "AI could not produce valid JSON. Raw output logged to server." });
        console.error("AI JSON validation raw output:", gptOutput);
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
      const { message, documentIds } = req.body;
      if (!message) return res.status(400).json({ message: "message is required" });

      const systemPrompt = `You are a curriculum assistant for teachers across ALL subjects (Mathematics, Physics, Chemistry, Biology, Economics, Business Studies, Computer Science, English Language, English Literature, Geography, History, etc.). You generate assessment questions aligned with Cambridge International Education (CIE) syllabi — including IGCSE, AS Level, and A Level.

QUESTION STYLE GUIDELINES:
- Structure questions using CIE command words: Calculate, State, Explain, Describe, Evaluate, Compare, Suggest, Define, Outline, Analyse, Discuss, Assess, Justify.
- For quantitative subjects, model questions after CIE past paper formats (pastpapers.co, papacambridge.com) with realistic values and proper units.
- Use multi-part questions where appropriate (a, b, c) with escalating difficulty.
- Allocate marks realistically (1-2 marks for recall, 3-4 for application, 5+ for evaluation/analysis).

FORMATTING RULES:
- Wrap ALL mathematical expressions in LaTeX delimiters: \\( ... \\) for inline, \\[ ... \\] for display.
- Use proper LaTeX for fractions (\\frac{}{}), powers (^{}), subscripts (_{}), units (\\text{m/s}^{2}), Greek letters (\\alpha, \\beta, \\theta), etc.
- NEVER output bare LaTeX commands without delimiters.
- For non-math subjects, use clean plain text with proper formatting.

STRICT MCQ RULE: Every question you generate MUST be a Multiple Choice Question with EXACTLY 4 options. Compute 1 correct answer and 3 highly plausible distractors based on common student errors. NEVER generate open-ended or structured questions. NEVER provide fewer or more than 4 options.

Respond conversationally first, then include a strict JSON array of draft questions using this schema: [{ "prompt_text": string, "options": [string, string, string, string], "correct_answer": string, "marks_worth": number, "image_url": string | null }].`;

      // If PDFs were uploaded as supporting docs, send them directly to Gemini
      // as multimodal input so it can see the original formatting, tables, diagrams
      const pdfFileIds = Array.isArray(documentIds) ? documentIds : [];
      const docsDir = path.resolve(process.cwd(), "supporting-docs");
      const pdfParts: { inlineData: { mimeType: string; data: string } }[] = [];
      for (const fileId of pdfFileIds) {
        // Validate filename to prevent directory traversal
        if (typeof fileId !== "string" || fileId.includes("..") || fileId.includes("/")) continue;
        const filePath = path.join(docsDir, fileId);
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          pdfParts.push({ inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } });
        }
      }

      if (pdfParts.length > 0) {
        // Use Gemini directly for multimodal PDF + text input
        try {
          const geminiModel = getGeminiModel();
          const start = Date.now();
          const result = await geminiModel.generateContent([
            { text: systemPrompt + "\n\nThe teacher has uploaded supporting documents (past papers, syllabi, textbook excerpts) as PDFs attached below. Use these documents to inform your question generation — match the style, difficulty, topic coverage, and format of the uploaded materials. When the teacher asks you to generate questions based on the uploaded documents, refer directly to their content.\n\nTeacher's message: " + String(message) },
            ...pdfParts,
          ]);
          const data = result.response.text();
          const durationMs = Date.now() - start;
          const drafts = extractJsonArray(data) || [];
          res.json({ reply: data, drafts, metadata: { provider: "google", model: "gemini-2.5-flash", durationMs } });
          return;
        } catch (geminiErr: any) {
          console.error("Gemini multimodal failed, falling back to text-only:", geminiErr.message);
          // Fall through to text-only generateWithFallback below
        }
      }

      const { data, metadata } = await generateWithFallback(systemPrompt, String(message));
      const drafts = extractJsonArray(data) || [];
      res.json({ reply: data, drafts, metadata });
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

      const systemPrompt = `You are an expert academic tutor across all subjects. Analyze student quiz submissions and provide detailed performance reports.

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
- Recommended Next Steps (actionable study tips, as <ul><li> items)`;

      const userPrompt = `Student scored ${submission.totalScore}/${submission.maxPossibleScore}.\n\nQuestion breakdown:\n${JSON.stringify(breakdown, null, 2)}`;

      const { data, metadata } = await generateWithFallback(systemPrompt, userPrompt);
      let html = data.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      html += `<hr style="margin-top: 30px; border-color: #334155;"/><p style="font-size: 10px; color: #64748b; text-align: center; text-transform: uppercase; letter-spacing: 0.1em;">Generated by ${metadata.provider} (${metadata.model}) in ${(metadata.durationMs / 1000).toFixed(2)}s</p>`;
      res.json({ analysis: html, metadata });
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

      const payload = submissions.map((s) => ({
        student: `${s.student.firstName} ${s.student.lastName}`,
        totalScore: s.totalScore,
        maxPossibleScore: s.maxPossibleScore,
        answersBreakdown: s.answersBreakdown,
      }));

      const systemPrompt = `You are a master academic tutor. Analyze cohort quiz data. Identify macro-trends, the most commonly failed questions, and the specific concepts the class as a whole is struggling with. Output in clean, professional HTML — no markdown, no code fences.`;

      const userPrompt = `Questions:\n${JSON.stringify(questions, null, 2)}\n\nSubmissions:\n${JSON.stringify(payload, null, 2)}`;

      const { data, metadata } = await generateWithFallback(systemPrompt, userPrompt);
      let html = data.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      html += `<hr style="margin-top: 30px; border-color: #334155;"/><p style="font-size: 10px; color: #64748b; text-align: center; text-transform: uppercase; letter-spacing: 0.1em;">Generated by ${metadata.provider} (${metadata.model}) in ${(metadata.durationMs / 1000).toFixed(2)}s</p>`;
      res.json({ analysis: html, submissionCount: submissions.length, metadata });
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

  const somaGenerateSchema = z.object({
    topic: z.string().min(1, "topic is required"),
    title: z.string().optional(),
    curriculumContext: z.string().optional(),
  });

  app.post("/api/soma/generate", requireAdmin, async (req, res) => {
    try {
      const parsed = somaGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { topic, title, curriculumContext } = parsed.data;
      const quizTitle = title || `${topic} Quiz`;

      const result = await generateAuditedQuiz(topic);

      const quiz = await storage.createSomaQuiz({
        title: quizTitle,
        topic,
        curriculumContext: curriculumContext || null,
        status: "draft",
      });

      const insertedQuestions = await storage.createSomaQuestions(
        result.questions.map((q) => ({
          quizId: quiz.id,
          stem: q.stem,
          options: q.options,
          correctAnswer: q.correct_answer,
          explanation: q.explanation || null,
          marks: q.marks,
        }))
      );

      res.json({
        quiz,
        questions: insertedQuestions,
        pipeline: {
          stages: ["Claude 3.5 Sonnet → Generation", "DeepSeek R1 → Content Audit", "Gemini 2.5 Flash → Syllabus Audit"],
          totalQuestions: insertedQuestions.length,
        },
      });
    } catch (err: any) {
      console.error("[SOMA] Generation failed:", err);
      res.status(500).json({ message: `Pipeline failed: ${err.message}` });
    }
  });

  app.get("/api/soma/quizzes", async (_req, res) => {
    try {
      const allQuizzes = await storage.getSomaQuizzes();
      res.json(allQuizzes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/soma/quizzes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid quiz ID" });

      const quiz = await storage.getSomaQuiz(id);
      if (!quiz) return res.status(404).json({ message: "Quiz not found" });
      res.json(quiz);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/soma/quizzes/:id/questions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid quiz ID" });

      const allQuestions = await storage.getSomaQuestionsByQuizId(id);
      const sanitized = allQuestions.map(({ correctAnswer, explanation, ...rest }) => rest);
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/soma/quizzes/:id/submit", async (req, res) => {
    try {
      const quizId = parseInt(req.params.id);
      if (isNaN(quizId)) return res.status(400).json({ message: "Invalid quiz ID" });

      const { studentId, studentName, answers } = req.body;
      if (!studentId || !studentName || !answers) {
        return res.status(400).json({ message: "Missing studentId, studentName, or answers" });
      }

      const alreadySubmitted = await storage.checkSomaSubmission(quizId, studentId);
      if (alreadySubmitted) {
        return res.status(409).json({ message: "You have already submitted this quiz." });
      }

      const allQuestions = await storage.getSomaQuestionsByQuizId(quizId);
      if (!allQuestions.length) {
        return res.status(404).json({ message: "No questions found for this quiz." });
      }

      let totalScore = 0;
      for (const q of allQuestions) {
        if (answers[String(q.id)] === q.correctAnswer) {
          totalScore += q.marks;
        }
      }

      const report = await storage.createSomaReport({
        quizId,
        studentId,
        studentName,
        score: totalScore,
        status: "pending",
        answersJson: answers,
      });

      res.json(report);

      const maxPossibleScore = allQuestions.reduce((s, q) => s + q.marks, 0);
      runBackgroundGrading(report.id, allQuestions, answers, totalScore, maxPossibleScore).catch(() => {});
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/soma/quizzes/:id/check-submission", async (req, res) => {
    try {
      const quizId = parseInt(req.params.id);
      const studentId = req.query.studentId as string;
      if (isNaN(quizId) || !studentId) {
        return res.status(400).json({ message: "quizId and studentId required" });
      }
      const exists = await storage.checkSomaSubmission(quizId, studentId);
      res.json({ submitted: exists });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/soma/reports/:reportId/review", async (req, res) => {
    try {
      const reportId = parseInt(req.params.reportId);
      if (isNaN(reportId)) return res.status(400).json({ message: "Invalid report ID" });

      const report = await storage.getSomaReportById(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });

      const questions = await storage.getSomaQuestionsByQuizId(report.quizId);

      res.json({
        report,
        questions: questions.map((q) => ({
          id: q.id,
          stem: q.stem,
          options: q.options,
          correctAnswer: q.correctAnswer,
          marks: q.marks,
          explanation: q.explanation,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/soma/reports/:reportId/retry", async (req, res) => {
    try {
      const reportId = parseInt(req.params.reportId);
      if (isNaN(reportId)) return res.status(400).json({ message: "Invalid report ID" });

      const report = await storage.getSomaReportById(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });

      if (report.status !== "failed") {
        return res.status(400).json({ message: "Only failed reports can be retried" });
      }

      await storage.updateSomaReport(reportId, { status: "pending", aiFeedbackHtml: null });

      const questions = await storage.getSomaQuestionsByQuizId(report.quizId);
      const answers = (report.answersJson as Record<string, string>) || {};
      const maxPossibleScore = questions.reduce((s, q) => s + q.marks, 0);

      res.json({ message: "Retry started", reportId });

      runBackgroundGrading(reportId, questions, answers, report.score, maxPossibleScore).catch(() => {});
    } catch (err: any) {
      console.error("[Retry Grading] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/soma/global-tutor", async (req, res) => {
    try {
      const { message, studentId } = req.body;
      if (!message) return res.status(400).json({ message: "Message is required" });

      let completedContext = "";
      let untestedContext = "";
      let hasStudentData = false;

      if (studentId) {
        const [reports, allSomaQuizzes] = await Promise.all([
          storage.getSomaReportsByStudentId(studentId),
          storage.getSomaQuizzes(),
        ]);

        const completedReports = reports.filter(
          (r) => r.status === "completed" && r.aiFeedbackHtml
        );

        if (completedReports.length > 0) {
          hasStudentData = true;
          const feedbackEntries = completedReports.map((r, i) => {
            const scoreInfo = r.score !== null ? `Score: ${r.score}/100 (${r.score}%)` : "Score: N/A";
            return `--- Quiz ${i + 1}: "${r.quiz.title}" | Topic: ${r.quiz.topic || "General"} | ${scoreInfo} ---\n${r.aiFeedbackHtml}`;
          });
          completedContext = feedbackEntries.join("\n\n");
        }

        const completedQuizIds = new Set(reports.map((r) => r.quizId));
        const untestedQuizzes = allSomaQuizzes
          .filter((q) => q.status === "published" && !completedQuizIds.has(q.id));

        if (untestedQuizzes.length > 0) {
          hasStudentData = true;
          untestedContext = untestedQuizzes.map((q) => {
            return `- "${q.title}" | Topic: ${q.topic || "General"} | Curriculum: ${q.curriculumContext || "N/A"}`;
          }).join("\n");
        }
      }

      const systemPrompt = hasStudentData
        ? `You are an elite academic advisor. You are provided with a student's past quiz feedback, AND a list of upcoming syllabus topics they have not yet been tested on. You must output a 3-part HTML report:

1. **Overall Standing**: A brutal but fair assessment of their current grades.

2. **Weak Fundamentals**: What they keep getting wrong based on past feedback.

3. **Untested Territory (CRITICAL)**: Look at the 'Untested Quizzes' array provided. Explicitly list the topics they have not taken yet, and advise them on how to prepare for those specific upcoming subjects.

Also answer any specific question the student asks, informed by their performance history and untested topics. Use <h3> for section headings, <ul>/<li> for lists, <p> for paragraphs, and <strong> for emphasis. Format output as clean HTML.`
        : "You are a helpful and encouraging math tutor. Answer the student's question clearly and thoroughly. Use LaTeX notation where appropriate (wrap inline math in $...$ and display math in $$...$$).";

      let userPrompt = message;
      if (hasStudentData) {
        const dataSections: string[] = [];
        if (completedContext) {
          dataSections.push(`=== COMPLETED QUIZ FEEDBACK (${completedContext.split("--- Quiz").length - 1} quizzes) ===\n${completedContext}\n=== END COMPLETED ===`);
        }
        if (untestedContext) {
          dataSections.push(`=== UNTESTED QUIZZES (topics not yet attempted) ===\n${untestedContext}\n=== END UNTESTED ===`);
        }
        userPrompt = `${dataSections.join("\n\n")}\n\nStudent's Question: ${message}`;
      }

      const result = await generateWithFallback(systemPrompt, userPrompt);
      res.json({ reply: result.data });
    } catch (err: any) {
      console.error("[Global Tutor] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
