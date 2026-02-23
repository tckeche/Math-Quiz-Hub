# Math MCQ Quiz Generation & Assessment Platform

## Overview
A full-stack Mathematics MCQ Quiz Generation and Assessment Platform. Students can take timed, interactive multiple-choice math quizzes with LaTeX-rendered mathematical notation. Admins can create quizzes, upload JSON question banks, generate questions from PDFs via Google Gemini AI, and view/export results with AI-powered student analysis.

## Tech Stack
- **Frontend:** React (Vite), Tailwind CSS, Shadcn UI, react-katex for LaTeX rendering, DOMPurify for XSS protection
- **Backend:** Node.js, Express, @google/generative-ai (Gemini), @anthropic-ai/sdk (Claude), openai (GPT-4o & DeepSeek), multer for file uploads
- **Database:** PostgreSQL with Drizzle ORM
- **Routing:** wouter

## Project Architecture

### Database Schema
- `quizzes` - id, title, time_limit_minutes, due_date, created_at
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
- `client/src/pages/admin.tsx` - Admin dashboard (login, quiz management, question upload, PDF generation, AI analysis)
- `client/src/pages/quiz.tsx` - Student quiz interface (entry gate, exam view, timer, submission, single-attempt enforcement)

### API Endpoints
- `GET /api/quizzes` - List all quizzes
- `GET /api/quizzes/:id` - Get single quiz
- `GET /api/quizzes/:id/questions` - Get questions (correctAnswer excluded)
- `POST /api/students` - Register student (names sanitized)
- `POST /api/check-submission` - Check if student already submitted (single-attempt enforcement)
- `POST /api/submissions` - Submit quiz answers (auto-scored)
- `GET/POST /api/admin/quizzes` - Admin quiz management
- `POST /api/admin/quizzes/:id/questions` - Upload questions
- `DELETE /api/admin/questions/:id` - Delete question
- `GET /api/admin/quizzes/:id/submissions` - View submissions
- `POST /api/generate-questions` - Upload PDF, 4-stage AI pipeline extracts MCQs (SSE streaming, multipart/form-data)
- `POST /api/analyze-student` - AI analysis of student performance (sends submission + questions to Gemini)
- `POST /api/upload-image` - Upload image for question attachment

### Key Features
- Admin password: Stored in ADMIN_PASSWORD env var; JWT sessions via JWT_SECRET env var
- LaTeX rendering via react-katex (InlineMath/BlockMath)
- Anti-cheat timer persisted in localStorage
- Auto-submit on timer expiry
- One question at a time with navigation dots
- Summary screen before final submission
- CSV export for results
- JSON question upload (file or paste) with error handling
- **AI PDF Quiz Generation (Mixture of Experts)**: Upload math exam PDF → 4-stage pipeline: Gemini 2.5 Flash (PDF vision extraction) → DeepSeek R1 (mathematical reasoning/solving) → Claude Sonnet (LaTeX formatting) → GPT-4o (JSON schema validation) → Review & Edit stage → Publish. Uses SSE streaming with real-time stage progress UI. Route timeout: 120s.
- **Review & Edit Stage**: Edit prompt text, options, correct answer, marks; attach/remove images per question; remove individual questions
- **AI Student Analysis**: Per-submission "Analyze with AI" button → identifies weak areas and provides actionable feedback (HTML sanitized with DOMPurify)
- **AI Orchestrator**: Centralized 3-tier Gemini waterfall fallback (`server/services/aiOrchestrator.ts`): gemini-2.5-flash → gemini-2.5-pro → gemini-1.5-pro. All AI calls (copilot-chat, analyze-student, analyze-class, PDF pipeline stages 2-4, Soma pipeline) route through `generateWithFallback(systemPrompt, userPrompt, expectedSchema?)`. Supports optional schema enforcement via `responseMimeType: "application/json"` + `responseSchema`. Only PDF Stage 1 (multimodal Gemini extraction) remains a direct SDK call. Uses GEMINI_API_KEY secret.
- **Single-Attempt Enforcement**: Server-side check via POST /api/check-submission (name matching with sanitization) + localStorage cache for fast client-side blocking
- **Image Upload**: Attach images to questions during review/edit stage, stored in client/public/uploads/
- **SPA Navigation**: All internal links use wouter `<Link>` (no `<a>` tags or `window.location.href`) to prevent full-page reloads and session loss. Admin session query uses stable key with cache invalidation.
- **LaTeX Preview**: Review & Edit and AI Builder draft UIs show live LaTeX preview with `unescapeLatex()` for visual rendering while keeping double-escaped JSON for database storage.
- **Closed Quiz UX**: Past-due quizzes show disabled "Assessment Closed" button with "Closed" badge on student portal.
- **Class Analytics Error Handling**: AI analysis mutation shows toast on error or empty result instead of hanging silently.
- **Soma Intelligence Pipeline**: Multi-agent AI quiz generation (Claude Sonnet → DeepSeek → Gemini) using structured outputs (Tool Use, JSON Schema, responseSchema). Service: `server/services/aiPipeline.ts`. Routes: `/api/soma/generate` (admin), `/api/soma/quizzes`, `/api/soma/quizzes/:id`, `/api/soma/quizzes/:id/questions`.
- **Soma Quiz Engine**: Student-facing quiz UI at `/soma/quiz/:id` with glassmorphism cards, LaTeX rendering, option selection, navigation dots, skip/next, and summary view. Answers stored in React state only (no submission endpoint yet).

### Soma Pipeline Tables
- `soma_quizzes` - id, title, topic, curriculum_context, status (draft/published), created_at
- `soma_questions` - id, quiz_id (FK → soma_quizzes), stem, options (JSON), correct_answer, explanation, marks
- `soma_reports` - id, quiz_id (FK → soma_quizzes), student_name, score, ai_feedback_html, created_at
