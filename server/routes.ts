import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { questionUploadSchema } from "@shared/schema";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import path from "path";
import fs from "fs";

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
});

const pdfUpload = multer({ storage: multer.memoryStorage() });

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

function generatePinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pin = "";
  for (let i = 0; i < 5; i++) {
    pin += chars[Math.floor(Math.random() * chars.length)];
  }
  return pin;
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
  app.get("/api/quizzes", async (_req, res) => {
    const quizzes = await storage.getQuizzes();
    const sanitized = quizzes.map(({ pinCode, ...quiz }) => quiz);
    res.json(sanitized);
  });

  app.get("/api/quizzes/:id", async (req, res) => {
    const quiz = await storage.getQuiz(parseInt(req.params.id));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    const { pinCode, ...safeQuiz } = quiz;
    res.json(safeQuiz);
  });

  app.get("/api/quizzes/:id/questions", async (req, res) => {
    const quizId = parseInt(req.params.id);
    const pin = String(req.query.pin || "").trim().toUpperCase();
    const quiz = await storage.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (!pin || pin !== quiz.pinCode) {
      return res.status(403).json({ message: "Invalid quiz PIN" });
    }
    const qs = await storage.getQuestionsByQuizId(quizId);
    const sanitized = qs.map(({ correctAnswer, ...rest }) => rest);
    res.json(sanitized);
  });

  app.post("/api/students", async (req, res) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ message: "First and last name required" });
    const student = await storage.createStudent({ firstName, lastName });
    res.json(student);
  });

  app.post("/api/check-submission", async (req, res) => {
    const { quizId, firstName, lastName, pin } = req.body;
    if (!quizId || !firstName || !lastName || !pin) {
      return res.status(400).json({ message: "quizId, firstName, lastName, and pin required" });
    }
    const quiz = await storage.getQuiz(Number(quizId));
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (String(pin).trim().toUpperCase() !== quiz.pinCode) {
      return res.status(403).json({ message: "Invalid quiz PIN" });
    }
    const hasSubmitted = await storage.checkStudentSubmission(quizId, firstName, lastName);
    res.json({ hasSubmitted });
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
      pinCode: generatePinCode(),
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

  app.post("/api/generate-questions", pdfUpload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No PDF file uploaded" });

      const model = getGeminiModel();
      const base64Pdf = req.file.buffer.toString("base64");

      const prompt = `Extract multiple-choice questions from this math exam. Solve them to find the correct answer. Output strictly as a JSON array of objects matching this schema: [{ "prompt_text": string, "options": [string], "correct_answer": string, "marks_worth": number }]. You MUST use LaTeX for all mathematical notation. Crucially, because this is a JSON output, you MUST double-escape all LaTeX backslashes (e.g., use \\\\frac instead of \\frac, and \\\\sqrt instead of \\sqrt) so the JSON parser does not strip them. Do not include any markdown formatting, code fences, or explanations. Output ONLY the JSON array.`;

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Pdf,
          },
        },
      ]);

      const questions = extractJsonArray(result.response.text());
      if (!questions) return res.status(500).json({ message: "AI did not return valid JSON" });

      res.json({ questions });
    } catch (err: any) {
      console.error("AI generation error:", err);
      res.status(500).json({ message: `AI generation failed: ${err.message}` });
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

  app.post("/api/analyze-student", async (req, res) => {
    try {
      const { submission, questions } = req.body;
      if (!submission || !questions) {
        return res.status(400).json({ message: "submission and questions required" });
      }

      const model = getGeminiModel();
      const breakdown = Object.entries(submission.answersBreakdown).map(([qId, detail]: [string, any]) => {
        const question = questions.find((q: any) => String(q.id) === qId);
        return {
          question: question?.promptText || "Unknown",
          studentAnswer: detail.answer || "No answer",
          correct: detail.correct,
          marksEarned: detail.marksEarned,
          marksWorth: question?.marksWorth || 1,
        };
      });

      const prompt = `You are an expert mathematics tutor. Analyze this student's quiz submission. Identify which specific mathematical concepts they are struggling with based on the questions they got wrong. Keep the analysis concise, actionable, and formatted in clean HTML.\n\nStudent scored ${submission.totalScore}/${submission.maxPossibleScore}.\n\nQuestion breakdown:\n${JSON.stringify(breakdown, null, 2)}`;

      const result = await model.generateContent(prompt);
      let html = result.response.text();
      html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      res.json({ analysis: html });
    } catch (err: any) {
      res.status(500).json({ message: `AI analysis failed: ${err.message}` });
    }
  });

  app.post("/api/analyze-class", async (req, res) => {
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

  app.post("/api/upload-image", upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  return httpServer;
}
