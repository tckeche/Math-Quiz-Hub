# Math MCQ Quiz Generation & Assessment Platform

## Overview
A full-stack Mathematics MCQ Quiz Generation and Assessment Platform. Students can take timed, interactive multiple-choice math quizzes with LaTeX-rendered mathematical notation. Admins can create quizzes, upload JSON question banks, generate questions from PDFs via Google Gemini AI, and view/export results with AI-powered student analysis.

## Tech Stack
- **Frontend:** React (Vite), Tailwind CSS, Shadcn UI, react-katex for LaTeX rendering, DOMPurify for XSS protection
- **Backend:** Node.js, Express, @google/generative-ai (Gemini), multer for file uploads
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
- `POST /api/generate-questions` - Upload PDF, Gemini AI extracts MCQs with LaTeX (multipart/form-data)
- `POST /api/analyze-student` - AI analysis of student performance (sends submission + questions to Gemini)
- `POST /api/upload-image` - Upload image for question attachment

### Key Features
- Admin password: "Chomukamba" (client-side localStorage gate)
- LaTeX rendering via react-katex (InlineMath/BlockMath)
- Anti-cheat timer persisted in localStorage
- Auto-submit on timer expiry
- One question at a time with navigation dots
- Summary screen before final submission
- CSV export for results
- JSON question upload (file or paste) with error handling
- **AI PDF Quiz Generation**: Upload math exam PDF → Gemini extracts MCQs → Review & Edit stage → Publish
- **Review & Edit Stage**: Edit prompt text, options, correct answer, marks; attach/remove images per question; remove individual questions
- **AI Student Analysis**: Per-submission "Analyze with AI" button → Gemini identifies weak areas and provides actionable feedback (HTML sanitized with DOMPurify)
- **Single-Attempt Enforcement**: Server-side check via POST /api/check-submission (name matching with sanitization) + localStorage cache for fast client-side blocking
- **Image Upload**: Attach images to questions during review/edit stage, stored in client/public/uploads/
