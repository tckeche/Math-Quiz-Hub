import type { Express } from "express";
import { createServer, type Server } from "http";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
    const student = await storage.createStudent({ firstName, lastName });
    res.json(student);
  });

  app.post("/api/check-submission", async (req, res) => {
    const { quizId, firstName, lastName } = req.body;
    if (!quizId || !firstName || !lastName) {
      return res.status(400).json({ message: "quizId, firstName, and lastName required" });
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

      let responseText = result.response.text();
      responseText = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

      const parsed = JSON.parse(responseText);
      const questions = Array.isArray(parsed) ? parsed : [parsed];

      res.json({ questions });
    } catch (err: any) {
      console.error("AI generation error:", err);
      res.status(500).json({ message: `AI generation failed: ${err.message}` });
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

      const prompt = `You are an expert mathematics tutor. Analyze this student's quiz submission. Identify which specific mathematical concepts they are struggling with based on the questions they got wrong. Keep the analysis concise, actionable, and formatted in clean HTML.

Student scored ${submission.totalScore}/${submission.maxPossibleScore}.

Question breakdown:
${JSON.stringify(breakdown, null, 2)}`;

      const result = await model.generateContent(prompt);
      let html = result.response.text();
      html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

      res.json({ analysis: html });
    } catch (err: any) {
      console.error("AI analysis error:", err);
      res.status(500).json({ message: `AI analysis failed: ${err.message}` });
    }
  });

  app.post("/api/upload-image", upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  return httpServer;
}
