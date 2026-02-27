import type { Express, NextFunction, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { questionUploadSchema, submissions as submissionsTable, insertSomaQuizSchema, insertSomaUserSchema, quizzes, questions, submissions, somaUsers, quizAssignments, somaQuizzes } from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { fetchPaperContext, generateAuditedQuiz, parsePdfTextFromBuffer } from "./services/aiPipeline";
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

function getAdminUsername(): string {
  return String(process.env.ADMIN_USERNAME || "admin").toLowerCase();
}

function getAdminPasswordHash(): string {
  return String(process.env.ADMIN_PASSWORD_HASH || "");
}

function getLegacyAdminPassword(): string {
  return String(process.env.ADMIN_PASSWORD || "");
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, iterationsRaw, salt, expectedHash] = storedHash.split("$");
  if (!algorithm || !iterationsRaw || !salt || !expectedHash || algorithm !== "pbkdf2") {
    return false;
  }
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 10_000) {
    return false;
  }
  const keyLength = Buffer.from(expectedHash, "hex").length;
  const derived = crypto.pbkdf2Sync(password, salt, iterations, keyLength, "sha512");
  const expected = Buffer.from(expectedHash, "hex");
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
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

const TUTOR_EMAIL_DOMAIN = process.env.TUTOR_EMAIL_DOMAIN || "melaniacalvin.com";

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin.soma@melaniacalvin.com";

function determinRole(email: string): "tutor" | "student" | "super_admin" {
  if (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return "super_admin";
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === TUTOR_EMAIL_DOMAIN.toLowerCase() ? "tutor" : "student";
}

function requireTutor(req: Request, res: Response, next: NextFunction) {
  const tutorId = req.headers["x-tutor-id"] as string;
  if (!tutorId) {
    return res.status(401).json({ message: "Tutor ID required" });
  }
  storage.getSomaUserById(tutorId).then((user) => {
    if (!user || (user.role !== "tutor" && user.role !== "super_admin")) {
      return res.status(403).json({ message: "Access denied: tutor role required" });
    }
    (req as any).tutorId = tutorId;
    (req as any).tutorUser = user;
    next();
  }).catch(() => {
    res.status(500).json({ message: "Failed to verify tutor identity" });
  });
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const adminId = req.headers["x-admin-id"] as string;
  if (!adminId) {
    return res.status(401).json({ message: "Admin ID required" });
  }
  storage.getSomaUserById(adminId).then((user) => {
    if (!user || user.role !== "super_admin") {
      return res.status(403).json({ message: "Access denied: super_admin role required" });
    }
    (req as any).adminId = adminId;
    (req as any).adminUser = user;
    next();
  }).catch(() => {
    res.status(500).json({ message: "Failed to verify admin identity" });
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const somaAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many AI requests. Please wait before trying again.",
      details: { retryWindowMs: 60_000 },
    },
  },
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

function sanitizeStudentIds(studentIds: unknown): string[] {
  if (!Array.isArray(studentIds)) return [];
  return Array.from(new Set(studentIds
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean)));
}

function sanitizeSubmittedAnswers(
  questions: { id: number }[],
  answers: unknown,
): Record<string, string> {
  if (!answers || typeof answers !== "object") return {};
  const rawAnswers = answers as Record<string, unknown>;
  const questionIds = new Set(questions.map((q) => String(q.id)));
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawAnswers)) {
    if (!questionIds.has(key) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) sanitized[key] = trimmed;
  }

  return sanitized;
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

    const breakdown = questions.map((q, idx) => {
      const questionNumber = idx + 1;
      const studentAnswer = studentAnswers[String(q.id)] || "(no answer)";
      const isCorrect = studentAnswer === q.correctAnswer;
      return `Question ${questionNumber}: ${q.stem}\nStudent Answer: ${studentAnswer}\nCorrect Answer: ${q.correctAnswer}\nResult: ${isCorrect ? "CORRECT" : "INCORRECT"} (${q.marks} marks)`;
    }).join("\n\n");

    const systemPrompt = `You are a mathematics tutor providing personalized feedback to a student. Analyze their quiz performance and provide actionable feedback in clean HTML format. Use <h3> for section headings, <ul>/<li> for lists, <p> for paragraphs, and <strong> for emphasis. Keep feedback encouraging yet specific about areas for improvement.

CRITICAL: When referencing specific questions in your report, you MUST use the sequential question numbers provided in the data (e.g., "In Question 1...", "For Question 4..."). You are strictly forbidden from making up numbers or using database IDs like Q156 or Q167. Always say "Question 1", "Question 2", etc.`;

    const userPrompt = `Student scored ${totalScore}/${maxPossibleScore} (${Math.round((totalScore / maxPossibleScore) * 100)}%).

Here is the question-by-question breakdown (numbered sequentially as they appear in the quiz):

${breakdown}

Provide:
1. An overall performance summary
2. Specific strengths demonstrated
3. Areas needing improvement with concrete study suggestions — reference questions by their sequential number (e.g. "Question 3")
4. For every incorrect response, include a 1-2 sentence explanation that starts with the exact label "Question X:" and briefly explains why the correct answer is right
5. Encouragement and next steps`;

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
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      if (res.statusCode >= 400 && !(body && typeof body === "object" && "error" in body)) {
        const message = typeof body?.message === "string" ? body.message : "Request failed";
        const details = body?.details ?? (body && body !== message ? body : undefined);
        return originalJson({
          error: {
            code: body?.code || `HTTP_${res.statusCode}`,
            message,
            details,
          },
        });
      }
      return originalJson(body);
    }) as typeof res.json;
    next();
  });

  app.use("/api/soma", somaAiLimiter);

  app.post("/api/auth/sync", async (req, res) => {
    try {
      const { id, email, user_metadata } = req.body;
      if (!id || !email) {
        return res.status(400).json({ message: "Missing id or email" });
      }
      const role = determinRole(email);
      const parsed = insertSomaUserSchema.parse({
        id,
        email,
        displayName: user_metadata?.display_name || user_metadata?.full_name || email.split("@")[0],
        role,
      });
      const user = await storage.upsertSomaUser(parsed);
      res.json(user);
    } catch (err: any) {
      console.error("Auth sync error:", err);
      res.status(500).json({ message: err.message || "Failed to sync user" });
    }
  });

  // Get current user's role and info
  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) return res.status(400).json({ message: "userId required" });
      const user = await storage.getSomaUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch user" });
    }
  });

  // ─── Tutor API Routes ──────────────────────────────────────────────

  // Get tutor's adopted students
  app.get("/api/tutor/students", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const students = await storage.getAdoptedStudents(tutorId);
      res.json(students);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch students" });
    }
  });

  // Get students available for adoption
  app.get("/api/tutor/students/available", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const available = await storage.getAvailableStudents(tutorId);
      res.json(available);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch available students" });
    }
  });

  // Adopt a student
  app.post("/api/tutor/students/adopt", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const { studentIds } = req.body;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "studentIds array required" });
      }
      const results = [];
      for (const studentId of studentIds) {
        const student = await storage.getSomaUserById(studentId);
        if (!student || student.role !== "student") continue;
        const record = await storage.adoptStudent(tutorId, studentId);
        results.push(record);
      }
      res.json({ adopted: results.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to adopt students" });
    }
  });

  // Remove adopted student
  app.delete("/api/tutor/students/:studentId", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      await storage.removeAdoptedStudent(tutorId, String(req.params.studentId));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to remove student" });
    }
  });

  // Get tutor's quizzes
  app.get("/api/tutor/quizzes", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const quizzes = await storage.getSomaQuizzesByAuthor(tutorId);
      res.json(quizzes);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch quizzes" });
    }
  });

  // Assign quiz to students
  app.post("/api/tutor/quizzes/:quizId/assign", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const quizId = parseInt(String(req.params.quizId));
      const studentIds = sanitizeStudentIds(req.body?.studentIds);
      if (studentIds.length === 0) {
        return res.status(400).json({ message: "studentIds array required" });
      }
      // Verify quiz belongs to this tutor
      const quiz = await storage.getSomaQuiz(quizId);
      if (!quiz || quiz.authorId !== tutorId) {
        return res.status(403).json({ message: "You can only assign your own quizzes" });
      }
      // Verify all students are adopted by this tutor
      const adopted = await storage.getAdoptedStudents(tutorId);
      const adoptedIds = new Set(adopted.map((s) => s.id));
      const validIds = studentIds.filter((id: string) => adoptedIds.has(id));
      if (validIds.length === 0) {
        return res.status(400).json({ message: "None of the provided students are adopted by you" });
      }
      const assignments = await storage.createQuizAssignments(quizId, validIds);
      res.json({ assigned: assignments.length, assignments });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to assign quiz" });
    }
  });

  // Get assignments for a specific quiz
  app.get("/api/tutor/quizzes/:quizId/assignments", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const quizId = parseInt(String(req.params.quizId));
      const quiz = await storage.getSomaQuiz(quizId);
      if (!quiz || quiz.authorId !== tutorId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const assignments = await storage.getQuizAssignmentsForQuiz(quizId);
      res.json(assignments);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch assignments" });
    }
  });

  app.get("/api/tutor/students/:studentId/comments", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const studentId = String(req.params.studentId);
      const adopted = await storage.getAdoptedStudents(tutorId);
      if (!adopted.some((s) => s.id === studentId)) return res.status(403).json({ message: "Access denied" });
      const comments = await storage.getTutorComments(tutorId, studentId);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch comments" });
    }
  });

  app.post("/api/tutor/students/:studentId/comments", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const studentId = String(req.params.studentId);
      const adopted = await storage.getAdoptedStudents(tutorId);
      if (!adopted.some((s) => s.id === studentId)) return res.status(403).json({ message: "Access denied" });
      const { comment } = req.body;
      if (!comment?.trim()) return res.status(400).json({ message: "Comment is required" });
      const result = await storage.addTutorComment({ tutorId, studentId, comment: comment.trim() });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to add comment" });
    }
  });

  app.get("/api/tutor/students/:studentId/performance", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const studentId = String(req.params.studentId);
      const adopted = await storage.getAdoptedStudents(tutorId);
      if (!adopted.some((s) => s.id === studentId)) return res.status(403).json({ message: "Access denied" });
      const [reports, submissions] = await Promise.all([
        storage.getSomaReportsByStudentId(studentId),
        storage.getSubmissionsByStudentUserId(studentId),
      ]);

      const reportsWithMax = await Promise.all(reports.map(async (r) => {
        const questions = await storage.getSomaQuestionsByQuizId(r.quizId);
        const maxScore = questions.reduce((s, q) => s + q.marks, 0);
        return { ...r, maxScore };
      }));

      res.json({ reports: reportsWithMax, submissions });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch performance" });
    }
  });

  app.get("/api/tutor/dashboard-stats", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const adoptedStudents = await storage.getAdoptedStudents(tutorId);
      const tutorQuizzes = await storage.getSomaQuizzesByAuthor(tutorId);

      const allReports: { studentName: string; score: number; quizTitle: string; subject: string | null; createdAt: string }[] = [];
      const subjectScores: Record<string, { total: number; max: number; count: number }> = {};

      for (const student of adoptedStudents) {
        const reports = await storage.getSomaReportsByStudentId(student.id);
        for (const r of reports) {
          const maxScore = r.quiz ? (await storage.getSomaQuestionsByQuizId(r.quizId)).reduce((s, q) => s + q.marks, 0) : 0;
          const subject = r.quiz?.subject || "General";
          if (!subjectScores[subject]) subjectScores[subject] = { total: 0, max: 0, count: 0 };
          subjectScores[subject].total += r.score;
          subjectScores[subject].max += maxScore;
          subjectScores[subject].count += 1;
          allReports.push({
            studentName: r.studentName,
            score: maxScore > 0 ? Math.round((r.score / maxScore) * 100) : 0,
            quizTitle: r.quiz?.title || "Unknown",
            subject,
            createdAt: r.createdAt.toISOString(),
          });
        }
      }

      const cohortAverages = Object.entries(subjectScores).map(([subject, data]) => ({
        subject,
        average: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
        count: data.count,
      }));

      const recentSubmissions = allReports
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      res.json({
        totalStudents: adoptedStudents.length,
        totalQuizzes: tutorQuizzes.length,
        cohortAverages,
        recentSubmissions,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch stats" });
    }
  });

  // ─── Super Admin Routes ──────────────────────────────────────────

  app.get("/api/super-admin/users", requireSuperAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllSomaUsers();
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch users" });
    }
  });

  app.delete("/api/super-admin/users/:userId", requireSuperAdmin, async (req, res) => {
    try {
      const userId = String(req.params.userId);
      const user = await storage.getSomaUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === "super_admin") return res.status(403).json({ message: "Cannot delete super admin" });
      await storage.deleteSomaUser(userId);
      res.json({ message: "User deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete user" });
    }
  });

  app.get("/api/super-admin/quizzes", requireSuperAdmin, async (_req, res) => {
    try {
      const quizzes = await storage.getAllSomaQuizzes();
      res.json(quizzes);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch quizzes" });
    }
  });

  app.delete("/api/super-admin/quizzes/:quizId", requireSuperAdmin, async (req, res) => {
    try {
      const quizId = parseInt(String(req.params.quizId));
      if (isNaN(quizId)) return res.status(400).json({ message: "Invalid quiz ID" });
      await storage.deleteSomaQuiz(quizId);
      res.json({ message: "Quiz deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete quiz" });
    }
  });

  app.get("/api/super-admin/stats", requireSuperAdmin, async (_req, res) => {
    try {
      const [users, quizzes] = await Promise.all([
        storage.getAllSomaUsers(),
        storage.getAllSomaQuizzes(),
      ]);
      const students = users.filter((u) => u.role === "student");
      const tutors = users.filter((u) => u.role === "tutor");
      res.json({
        totalUsers: users.length,
        totalStudents: students.length,
        totalTutors: tutors.length,
        totalQuizzes: quizzes.length,
        publishedQuizzes: quizzes.filter((q) => q.status === "published").length,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch stats" });
    }
  });

  // ─── Student Routes ──────────────────────────────────────────────

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

  // Row-level security: Only return quizzes explicitly assigned to this student
  app.get("/api/quizzes/available", async (req, res) => {
    try {
      const studentId = req.query.studentId as string;
      if (!studentId) return res.status(400).json({ message: "studentId required" });
      const assignments = await storage.getQuizAssignmentsForStudent(studentId);
      const unique = new Map<number, (typeof assignments)[number]["quiz"]>();
      for (const assignment of assignments) {
        const quiz = assignment.quiz;
        if (quiz.isArchived || quiz.status !== "published") continue;
        unique.set(quiz.id, quiz);
      }
      res.json(Array.from(unique.values()));
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch available quizzes" });
    }
  });

  app.post("/api/admin/login", loginLimiter, async (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const suppliedUsername = username || getAdminUsername();
    const suppliedPassword = password;

    const passwordHash = getAdminPasswordHash();
    const legacyPassword = getLegacyAdminPassword();
    const isValidUser = suppliedUsername === getAdminUsername();
    const isValidPassword = passwordHash
      ? verifyPassword(suppliedPassword, passwordHash)
      : Boolean(legacyPassword)
        && Buffer.byteLength(suppliedPassword) === Buffer.byteLength(legacyPassword)
        && crypto.timingSafeEqual(Buffer.from(suppliedPassword), Buffer.from(legacyPassword));

    if (!isValidUser || !isValidPassword) {
      return res.status(401).json({ message: "Invalid admin credentials." });
    }
    const token = jwt.sign({ role: "admin", username: suppliedUsername }, getJwtSecret(), { expiresIn: "12h" });
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
    const allQuizzes = await storage.getQuizzes();
    res.json(allQuizzes.filter((q) => !q.isArchived));
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
    const validQs = qs.filter((q) => Array.isArray(q.options) && q.options.length >= 4);
    const sanitized = validQs.map(({ correctAnswer, ...rest }) => rest);
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
    const allQuizzes = await storage.getQuizzes();
    const withSnapshots = await Promise.all(allQuizzes.map(async (quiz) => {
      const [quizQuestions, quizSubmissions] = await Promise.all([
        storage.getQuestionsByQuizId(quiz.id),
        storage.getSubmissionsByQuizId(quiz.id),
      ]);
      return {
        ...quiz,
        snapshot: {
          totalQuestions: quizQuestions.length,
          totalSubmissions: quizSubmissions.length,
          subject: quiz.subject || "General",
          level: quiz.level || "Unspecified",
        },
      };
    }));
    res.json(withSnapshots);
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
    const id = parseInt(String(req.params.id));
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

  app.post("/api/admin/quizzes/bulk-action", async (req, res) => {
    try {
      const bodySchema = z.object({
        quizIds: z.array(z.number().int().positive()).min(1),
        action: z.enum(["archive", "hard_delete", "extend_24h", "mark_open", "mark_overdue"]),
      });
      const parsed = bodySchema.parse(req.body);
      if (!db) {
        return res.status(500).json({ message: "Database unavailable for bulk actions" });
      }

      if (parsed.action === "archive") {
        await db.update(quizzes).set({ isArchived: true }).where(inArray(quizzes.id, parsed.quizIds));
      } else if (parsed.action === "hard_delete") {
        await db.delete(submissions).where(inArray(submissions.quizId, parsed.quizIds));
        await db.delete(questions).where(inArray(questions.quizId, parsed.quizIds));
        await db.delete(quizzes).where(inArray(quizzes.id, parsed.quizIds));
      } else if (parsed.action === "extend_24h") {
        await db.update(quizzes)
          .set({ dueDate: sql`${quizzes.dueDate} + interval '24 hour'` as any })
          .where(inArray(quizzes.id, parsed.quizIds));
      } else if (parsed.action === "mark_open") {
        const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
        await db.update(quizzes).set({ dueDate: future }).where(inArray(quizzes.id, parsed.quizIds));
      } else {
        const now = new Date();
        await db.update(quizzes).set({ dueDate: new Date(now.getTime() - 1000 * 60 * 5) }).where(inArray(quizzes.id, parsed.quizIds));
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Bulk action failed" });
    }
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

  app.post("/api/generate-questions", requireAdmin, (_req, res) => {
    res.status(410).json({ message: "Generate from PDF is now available only through Copilot supporting documents." });
  });

  app.post("/api/admin/copilot-chat", async (req, res) => {
    try {
      const { message, documentIds } = req.body;
      if (!message) return res.status(400).json({ message: "message is required" });

      const text = String(message);
      const missing: string[] = [];
      if (!/subject\s*:/i.test(text)) missing.push("Subject");
      if (!/level\s*:/i.test(text)) missing.push("Level");
      if (!/syllabus\s*:/i.test(text)) missing.push("Syllabus");
      const hasImplicitTopic = /about\s+\w+/i.test(text);
      if (missing.length > 0 && !hasImplicitTopic) {
        return res.json({
          reply: `Before I generate, please provide: ${missing.join(", ")}.`,
          drafts: [],
          metadata: { provider: "clarification", model: "copilot-guard", durationMs: 0 },
          needsClarification: true,
        });
      }

      let supportingText = "";
      const pdfFileIds = Array.isArray(documentIds) ? documentIds : [];
      const docsDir = path.resolve(process.cwd(), "supporting-docs");
      for (const fileId of pdfFileIds) {
        if (typeof fileId !== "string" || fileId.includes("..") || fileId.includes("/")) continue;
        const filePath = path.join(docsDir, fileId);
        if (fs.existsSync(filePath)) {
          supportingText += `
${await parsePdfTextFromBuffer(fs.readFileSync(filePath))}`;
        }
      }

      const paperCode = text.match(/\b\d{4}\/v\d\/\d{4}\b/i)?.[0];
      if (paperCode) {
        supportingText += `
${await fetchPaperContext(paperCode)}`;
      }

      const copilotSystemPrompt = `You are SOMA Copilot, an expert MCQ assessment generator for the MCEC platform.

CRITICAL: You MUST generate questions as a JSON array with this EXACT schema:
\`\`\`json
[
  {
    "prompt_text": "The full question text with LaTeX like \\\\(x^2\\\\) if needed",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correct_answer": "The full text of the correct option (must exactly match one of the options)",
    "marks_worth": 2,
    "explanation": "Brief explanation of why the correct answer is right"
  }
]
\`\`\`

RULES:
- "options" MUST be an array of exactly 4 strings. NEVER use an object like {A: ..., B: ...}.
- "correct_answer" MUST be the full text of the correct option, NOT a letter like "A" or "B".
- "prompt_text" is the question text. Do NOT use "question" or "stem" as the key name.
- Every question MUST have all 5 fields: prompt_text, options, correct_answer, marks_worth, explanation.
- Generate ONLY multiple-choice questions. NEVER generate open-ended, essay, or free-response questions.
- Include 1 correct answer and 3 calculated distractors based on common student errors.
- You may include a brief plain-text discussion before the JSON block.`;

      const { data, metadata } = await generateWithFallback(
        copilotSystemPrompt,
        `${text}

Supporting context:
${supportingText || "No extra context."}`,
      );

      const rawDrafts = extractJsonArray(data) || [];
      const drafts = rawDrafts.map((d: any) => {
        let opts = d.options;
        if (opts && !Array.isArray(opts) && typeof opts === "object") {
          const keys = Object.keys(opts);
          const isLetterKeyed = keys.every((k) => /^[A-Z]$/i.test(k));
          if (isLetterKeyed) {
            opts = keys.sort().map((k) => opts[k]);
          } else {
            opts = Object.values(opts);
          }
        }
        if (!Array.isArray(opts) || opts.length < 4) return null;
        opts = opts.map(String).slice(0, 4);

        const promptText = d.prompt_text || d.promptText || d.question || d.stem || "";
        if (!promptText) return null;

        let correctAnswer = d.correct_answer || d.correctAnswer || d.answer || "";
        if (typeof correctAnswer === "string" && correctAnswer.length <= 2) {
          const letterIndex = correctAnswer.toUpperCase().charCodeAt(0) - 65;
          if (letterIndex >= 0 && letterIndex < opts.length) {
            correctAnswer = opts[letterIndex];
          }
        }
        correctAnswer = String(correctAnswer);
        if (!correctAnswer || !opts.includes(correctAnswer)) return null;

        return {
          prompt_text: String(promptText),
          options: opts,
          correct_answer: correctAnswer,
          marks_worth: Number(d.marks_worth || d.marksWorth || d.marks || 1) || 1,
          explanation: String(d.explanation || ""),
        };
      }).filter(Boolean);
      res.json({ reply: data, drafts, metadata, needsClarification: false });
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
    subject: z.string().min(1).default("Mathematics"),
    syllabus: z.string().min(1).default("IEB"),
    level: z.string().min(1).default("Grade 6-12"),
    curriculumContext: z.string().optional(),
  });

  app.post("/api/soma/generate", requireAdmin, async (req, res) => {
    try {
      const parsed = somaGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { topic, title, curriculumContext, subject, syllabus, level } = parsed.data;
      const quizTitle = title || `${topic} Quiz`;

      const result = await generateAuditedQuiz({
        topic,
        subject,
        syllabus,
        level,
        copilotPrompt: curriculumContext,
      });

      const quiz = await storage.createSomaQuiz({
        title: quizTitle,
        topic,
        subject,
        syllabus,
        level,
        curriculumContext: curriculumContext || null,
        status: "draft",
        isArchived: false,
      });

      const insertedQuestions = await storage.createSomaQuestions(
        result.questions.map((q) => ({
          quizId: quiz.id,
          stem: q.stem,
          options: q.options,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
          marks: q.marks,
        }))
      );

      res.json({
        quiz,
        questions: insertedQuestions,
        pipeline: {
          stages: ["Claude Sonnet (Maker)", "Gemini 2.5 Flash (Checker)"],
          totalQuestions: insertedQuestions.length,
        },
      });
    } catch (err: any) {
      console.error("[SOMA] Generation failed:", err);
      res.status(500).json({ message: `Pipeline failed: ${err.message}` });
    }
  });

  // Tutor quiz generation — sets authorId and optionally assigns to students
  app.post("/api/tutor/quizzes/generate", requireTutor, async (req, res) => {
    try {
      const tutorId = (req as any).tutorId;
      const parsed = somaGenerateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { topic, title, curriculumContext, subject, syllabus, level } = parsed.data;
      const requestedStudentIds = sanitizeStudentIds(req.body?.assignTo);
      const quizTitle = title || `${topic} Quiz`;

      const result = await generateAuditedQuiz({
        topic, subject, syllabus, level,
        copilotPrompt: curriculumContext,
      });

      const adopted = await storage.getAdoptedStudents(tutorId);
      const adoptedIds = new Set(adopted.map((s) => s.id));
      const validAssignedStudentIds = requestedStudentIds.filter((id) => adoptedIds.has(id));

      const bundle = await storage.createSomaQuizBundle({
        quiz: {
          title: quizTitle,
          topic,
          subject,
          syllabus,
          level,
          curriculumContext: curriculumContext || null,
          authorId: tutorId,
          status: "published",
          isArchived: false,
        },
        questions: result.questions.map((q) => ({
          stem: q.stem,
          options: q.options,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
          marks: q.marks,
        })),
        assignedStudentIds: validAssignedStudentIds,
      });

      res.json({
        quiz: bundle.quiz,
        questions: bundle.questions,
        assignments: bundle.assignments.length,
        assignedStudentIds: validAssignedStudentIds,
        pipeline: {
          stages: ["Claude Sonnet (Maker)", "Gemini 2.5 Flash (Checker)"],
          totalQuestions: bundle.questions.length,
        },
      });
    } catch (err: any) {
      console.error("[SOMA Tutor] Generation failed:", err);
      res.status(500).json({ message: `Pipeline failed: ${err.message}` });
    }
  });

  app.get("/api/soma/quizzes", async (_req, res) => {
    try {
      const allQuizzes = await storage.getSomaQuizzes();
      res.json(allQuizzes.filter((q) => !q.isArchived));
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

      const assignments = await storage.getQuizAssignmentsForStudent(studentId);
      const hasAssignment = assignments.some((assignment) => assignment.quizId === quizId);
      if (!hasAssignment) {
        return res.status(403).json({ message: "Quiz is not assigned to this student" });
      }

      const alreadySubmitted = await storage.checkSomaSubmission(quizId, studentId);
      if (alreadySubmitted) {
        return res.status(409).json({ message: "You have already submitted this quiz." });
      }

      const allQuestions = await storage.getSomaQuestionsByQuizId(quizId);
      if (!allQuestions.length) {
        return res.status(404).json({ message: "No questions found for this quiz." });
      }

      const sanitizedAnswers = sanitizeSubmittedAnswers(allQuestions, answers);

      let totalScore = 0;
      for (const q of allQuestions) {
        if (sanitizedAnswers[String(q.id)] === q.correctAnswer) {
          totalScore += q.marks;
        }
      }

      const report = await storage.createSomaReport({
        quizId,
        studentId,
        studentName,
        score: totalScore,
        status: "pending",
        answersJson: sanitizedAnswers,
      });

      res.json(report);

      // Mark quiz assignment as completed
      storage.updateQuizAssignmentStatus(quizId, studentId, "completed").catch(() => {});

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
