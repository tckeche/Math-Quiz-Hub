# Math MCQ Quiz Generation & Assessment Platform

## Overview
A full-stack Mathematics MCQ Quiz Generation and Assessment Platform. Students can take timed, interactive multiple-choice math quizzes with LaTeX-rendered mathematical notation. Admins create and edit quizzes via a unified builder UI with AI copilot chat, PDF-based question generation, and manual entry. Results viewable with AI-powered student analysis.

## Tech Stack
- **Frontend:** React (Vite), Tailwind CSS, Shadcn UI, react-katex for LaTeX rendering, DOMPurify for XSS protection, @supabase/supabase-js for auth
- **Backend:** Node.js, Express, @google/generative-ai (Gemini), @anthropic-ai/sdk (Claude), openai (GPT-4o & DeepSeek), multer for file uploads
- **Database:** PostgreSQL (Supabase) with Drizzle ORM
- **Auth:** Supabase Auth (client initialized in `client/src/lib/supabase.ts` using VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)
- **Routing:** wouter

## Project Architecture

### Database Schema
- `quizzes` - id, title, time_limit_minutes, due_date, syllabus, level, subject, created_at
- `questions` - id, quiz_id, prompt_text (LaTeX), image_url, options (JSON array), correct_answer, marks_worth
- `students` - id, first_name, last_name (sanitized to lowercase, trimmed)
- `submissions` - id, student_id, quiz_id, total_score, max_possible_score, answers_breakdown (JSON), submitted_at

### Key Files
- `shared/schema.ts` - Drizzle schema definitions and Zod validation schemas
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage layer (DatabaseStorage class implementing IStorage interface)
- `server/routes.ts` - All API routes including AI endpoints
- `server/seed.ts` - Database seeding with sample quizzes
- `client/src/pages/home.tsx` - Homepage with quiz listing
- `client/src/pages/admin.tsx` - Admin dashboard (login, quiz listing, quiz detail view with results, PDF generation, AI analysis)
- `client/src/pages/builder.tsx` - Zero-click quiz builder: mobile-first responsive layout (flex-col → md:grid-cols-12). Order: Quiz Parameters → AI Copilot (main focus) → Supporting Documents → Saved Questions sidebar. Copilot auto-creates quiz and saves questions directly to DB (no draft state). All inputs h-12 with 44px touch targets. Calendar/Clock icons on date/time fields. Success modal with Preview/Dashboard buttons. Supports create (`/admin/builder`) and edit (`/admin/builder/:id`) modes.
- `client/src/lib/subjectColors.ts` - Shared subject color & icon utility. `getSubjectColor(subject)` returns hex + Tailwind classes (bg, border, ring, label). `getSubjectIcon(subject)` returns contextual Lucide icon (Calculator for math, FlaskConical for chemistry, Code for CS, etc.). Both cached for performance. Used by admin quiz cards, student quiz cards, and donut charts.
- `client/src/pages/quiz.tsx` - Student quiz interface (entry gate, exam view, timer, submission, single-attempt enforcement)
- `client/src/pages/StudentAuth.tsx` - Student login/signup with Supabase Auth (glassmorphism UI)
- `client/src/components/ProtectedRoute.tsx` - Auth-gated route wrapper using supabase.auth.onAuthStateChange
- `client/src/pages/TutorDashboard.tsx` - Tutor analytics dashboard with cohort donut charts, stat cards, recent submissions feed. Multi-page nav: Dashboard (active), Students, Assessments.
- `client/src/pages/TutorStudents.tsx` - Tutor student roster with adopt/remove, search, clickable drill-down links to `/tutor/students/:id`
- `client/src/pages/TutorStudentDetail.tsx` - Student drill-down: assessment history with scores, private tutor notes/comments system
- `client/src/pages/TutorAssessments.tsx` - Tutor assessment management with assign-to-students modal

### API Endpoints
- `GET /api/quizzes` - List all quizzes
- `GET /api/quizzes/:id` - Get single quiz
- `GET /api/quizzes/:id/questions` - Get questions (correctAnswer excluded)
- `POST /api/students` - Register student (names sanitized)
- `POST /api/check-submission` - Check if student already submitted (single-attempt enforcement)
- `POST /api/submissions` - Submit quiz answers (auto-scored)
- `GET/POST /api/admin/quizzes` - Admin quiz management
- `PUT /api/admin/quizzes/:id` - Update quiz metadata (title, time, due date, syllabus, level, subject)
- `POST /api/admin/quizzes/:id/questions` - Upload questions
- `DELETE /api/admin/questions/:id` - Delete question
- `GET /api/admin/quizzes/:id/submissions` - View submissions
- `POST /api/generate-questions` - Upload PDF, 4-stage AI pipeline extracts MCQs (SSE streaming, multipart/form-data)
- `POST /api/analyze-student` - AI analysis of student performance (sends submission + questions to Gemini)
- `POST /api/upload-image` - Upload image for question attachment
- `POST /api/auth/sync` - Upsert Supabase user into soma_users table (accepts {id, email, user_metadata})
- `GET /api/student/reports?studentId=` - Get student's soma reports with quiz data
- `GET /api/student/submissions?studentId=` - Get student's quiz submissions with quiz data
- `POST /api/soma/quizzes/:id/submit` - Submit soma quiz answers (auto-scored, creates soma_report with status=pending, stores answers in answersJson)
- `GET /api/soma/quizzes/:id/check-submission?studentId=` - Check if student already submitted soma quiz
- `GET /api/soma/reports/:reportId/review` - Get report + quiz questions with correct answers for review mode
- `POST /api/soma/reports/:reportId/retry` - Retry failed AI grading (resets to pending, re-runs background grading)
- `POST /api/soma/global-tutor` - Global AI Tutor endpoint (accepts { message }, returns { reply })

### Key Features
- Admin password: Stored in ADMIN_PASSWORD env var; JWT sessions via JWT_SECRET env var
- LaTeX rendering via react-katex (InlineMath/BlockMath)
- Anti-cheat timer persisted in localStorage
- Auto-submit on timer expiry
- One question at a time with navigation dots
- Summary screen before final submission
- CSV export for results
- **AI PDF Quiz Generation (Mixture of Experts)**: Upload math exam PDF → 4-stage pipeline: Gemini 2.5 Flash (PDF vision extraction) → DeepSeek R1 (mathematical reasoning/solving) → Claude Sonnet (LaTeX formatting) → GPT-4o (JSON schema validation) → Review & Edit stage → Publish. Uses SSE streaming with real-time stage progress UI. Route timeout: 120s.
- **Review & Edit Stage**: Edit prompt text, options, correct answer, marks; attach/remove images per question; remove individual questions
- **AI Student Analysis**: Per-submission "Analyze with AI" button → identifies weak areas and provides actionable feedback (HTML sanitized with DOMPurify)
- **AI Orchestrator**: Centralized dynamic fallback array (`server/services/aiOrchestrator.ts`). `AI_FALLBACK_CHAIN` iterates: claude-sonnet-4-6 → claude-haiku-4-5 → gemini-2.5-flash → gemini-2.5-pro → gemini-1.5-pro → deepseek-reasoner → deepseek-chat → gpt-5.1 → gpt-4o-mini. All AI calls (copilot-chat, analyze-student, analyze-class, PDF pipeline stages 2-4, Soma pipeline) route through `generateWithFallback(systemPrompt, userPrompt, expectedSchema?)`. Each provider uses native schema enforcement (Gemini: `responseSchema`, OpenAI/DeepSeek: `json_object`, Anthropic: tool calling). Only PDF Stage 1 (multimodal Gemini extraction) remains a direct SDK call. Uses GEMINI_API_KEY secret; OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY optional.
- **Single-Attempt Enforcement**: Server-side check via POST /api/check-submission (name matching with sanitization) + localStorage cache for fast client-side blocking
- **Image Upload**: Attach images to questions during review/edit stage, stored in client/public/uploads/
- **SPA Navigation**: All internal links use wouter `<Link>` (no `<a>` tags or `window.location.href`) to prevent full-page reloads and session loss. Admin session query uses stable key with cache invalidation.
- **LaTeX Preview**: Review & Edit and AI Builder draft UIs show live LaTeX preview with `unescapeLatex()` for visual rendering while keeping double-escaped JSON for database storage.
- **Closed Quiz UX**: Past-due quizzes show disabled "Assessment Closed" button with "Closed" badge on student portal.
- **Class Analytics Error Handling**: AI analysis mutation shows toast on error or empty result instead of hanging silently.
- **Soma Intelligence Pipeline**: Multi-agent AI quiz generation (Claude Sonnet → DeepSeek → Gemini) using structured outputs (Tool Use, JSON Schema, responseSchema). Service: `server/services/aiPipeline.ts`. Routes: `/api/soma/generate` (admin), `/api/soma/quizzes`, `/api/soma/quizzes/:id`, `/api/soma/quizzes/:id/questions`.
- **Soma Quiz Engine**: Student-facing quiz UI at `/soma/quiz/:id` with glassmorphism cards, LaTeX rendering, option selection, navigation dots, skip/next, and summary view. Answers stored in React state only (no submission endpoint yet). Supports preview mode via props (previewMode, previewTitle, previewQuestions, onExitPreview).
- **Admin Quiz Preview**: Builder page has "Preview Quiz" button that opens full-screen overlay rendering SomaQuizEngine with current saved+draft questions. Amber banner "Admin Preview Mode — Scores will not be saved." persists across question view and summary. Exit Preview button closes overlay.

### Copilot Draft Normalization
- The copilot response handler normalizes AI output to match `questionUploadSchema`: converts object options `{A: ..., B: ...}` to sorted arrays, maps field name variants (`question`/`stem` → `prompt_text`), converts letter answers ("B") to full option text, and validates `correct_answer ∈ options` before returning drafts.
- `questionUploadSchema` enforces: exactly 4 non-empty string options, non-empty `prompt_text` and `correct_answer`, `correct_answer` must match one of the options (`.refine()`).
- Auto-migration on startup: `server/index.ts` runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `is_archived`, `syllabus`, `level`, `subject` to keep Supabase DB in sync with Drizzle schema (since `drizzle.config.ts` uses `DATABASE_URL` which points to Replit DB, not Supabase).

### Soma Pipeline Tables
- `soma_users` - id (uuid, maps to Supabase auth UID), email, display_name, created_at
- `soma_quizzes` - id, title, topic, syllabus (default 'IEB'), level (default 'Grade 6-12'), subject, curriculum_context, status (draft/published), is_archived (default false), created_at
- `soma_questions` - id, quiz_id (FK → soma_quizzes), stem, options (JSON), correct_answer, explanation (NOT NULL), marks
- `soma_reports` - id, quiz_id (FK → soma_quizzes), student_id (uuid FK → soma_users), student_name, score, status (default: 'pending'), ai_feedback_html, answers_json (jsonb, student's submitted answers), created_at
- `tutor_comments` - id, tutor_id (uuid FK → soma_users), student_id (uuid FK → soma_users), comment (text), created_at
