import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Quiz, Question } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Clock, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2,
  Circle, Send, ArrowLeft, Home, ShieldAlert, Loader2
} from "lucide-react";
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';

function renderLatex(text: string) {
  if (!text) return null;
  const parts = text.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith('\\(') && part.endsWith('\\)')) {
      return <InlineMath key={i} math={part.slice(2, -2)} />;
    }
    if (part.startsWith('\\[') && part.endsWith('\\]')) {
      return <BlockMath key={i} math={part.slice(2, -2)} />;
    }
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return <BlockMath key={i} math={part.slice(2, -2)} />;
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 1) {
      return <InlineMath key={i} math={part.slice(1, -1)} />;
    }
    return <span key={i}>{part}</span>;
  });
}

function AlreadyTakenScreen({ quizTitle }: { quizTitle: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-md text-center p-10">
        <ShieldAlert className="w-16 h-16 mx-auto text-red-400/60 mb-4" />
        <h2 className="text-2xl font-bold mb-2 gradient-text" data-testid="text-already-taken">
          This test has already been taken.
        </h2>
        <p className="text-slate-400 mb-6">
          You have already submitted your answers for "{quizTitle}". Each student is allowed only one attempt.
        </p>
        <Link href="/">
          <Button className="glow-button" data-testid="button-back-home-taken">
            <Home className="w-4 h-4 mr-1.5" />
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  );
}

function EntryGate({ quiz, onStart, checking, error }: { quiz: Quiz; onStart: (firstName: string, lastName: string) => void; checking: boolean; error: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const isClosed = new Date(quiz.dueDate) < new Date();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || checking) return;
    onStart(firstName.trim(), lastName.trim());
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-lg p-8">
        <div className="text-center pb-6">
          <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-16 w-auto object-contain mx-auto mb-4" />
          <h2 className="text-2xl font-bold gradient-text" data-testid="text-quiz-entry-title">{quiz.title}</h2>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-slate-400">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-violet-400" />{quiz.timeLimitMinutes} minutes</span>
          </div>
        </div>
        <div>
          {isClosed ? (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 mx-auto text-red-400/60 mb-3" />
              <h3 className="text-lg font-semibold text-red-400">Examination Closed</h3>
              <p className="text-sm text-slate-400 mt-2">
                This examination closed on {new Date(quiz.dueDate).toLocaleDateString()}.
              </p>
              <Link href="/">
                <Button className="glow-button-outline mt-4" data-testid="button-back-home-closed">
                  <Home className="w-4 h-4 mr-1.5" />
                  Return Home
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-white/5 rounded-xl p-4 text-sm space-y-1 border border-white/5">
                <p className="font-medium text-slate-200">Instructions:</p>
                <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                  <li>You have <strong className="text-slate-200">{quiz.timeLimitMinutes} minutes</strong> to complete this examination.</li>
                  <li>The timer will start as soon as you click "Begin".</li>
                  <li>If you refresh, the timer will <strong className="text-slate-200">not</strong> reset.</li>
                  <li>The examination will auto-submit when time expires.</li>
                  <li>You are allowed <strong className="text-slate-200">one attempt only</strong>.</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-slate-300">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                    className="glass-input"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-slate-300">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                    className="glass-input"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-400" data-testid="text-entry-error">{error}</p>
              )}
              <Button type="submit" className="w-full glow-button py-3 text-base" size="lg" disabled={!firstName.trim() || !lastName.trim() || checking} data-testid="button-begin-quiz">
                {checking ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Begin Examination"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Timer({ startTime, timeLimitMinutes, onTimeUp }: { startTime: number; timeLimitMinutes: number; onTimeUp: () => void }) {
  const [remaining, setRemaining] = useState(0);
  const timeUpCalled = useRef(false);

  useEffect(() => {
    const update = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const totalSeconds = timeLimitMinutes * 60;
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(left);
      if (left <= 0 && !timeUpCalled.current) {
        timeUpCalled.current = true;
        onTimeUp();
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime, timeLimitMinutes, onTimeUp]);

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  const isLow = remaining < 300;
  const isCritical = remaining < 60;

  return (
    <div
      className={`font-mono text-lg font-bold tabular-nums ${isCritical ? "text-red-400 animate-pulse" : isLow ? "text-orange-400" : "text-violet-300"}`}
      data-testid="text-timer"
    >
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </div>
  );
}

function ExamView({ quiz, questions, studentId }: { quiz: Quiz; questions: Question[]; studentId: number }) {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submittingRef = useRef(false);

  const storageKey = `quiz_${quiz.id}_student_${studentId}`;
  const startTimeKey = `${storageKey}_startTime`;
  const answersKey = `${storageKey}_answers`;

  const [startTime] = useState<number>(() => {
    const saved = localStorage.getItem(startTimeKey);
    if (saved) return parseInt(saved);
    const now = Date.now();
    localStorage.setItem(startTimeKey, String(now));
    return now;
  });

  useEffect(() => {
    const savedAnswers = localStorage.getItem(answersKey);
    if (savedAnswers) {
      try { setAnswers(JSON.parse(savedAnswers)); } catch {}
    }
  }, [answersKey]);

  useEffect(() => {
    localStorage.setItem(answersKey, JSON.stringify(answers));
  }, [answers, answersKey]);

  const submitMutation = useMutation({
    mutationFn: async (data: { studentId: number; quizId: number; answers: Record<number, string> }) =>
      apiRequest("POST", "/api/submissions", data),
    onSuccess: () => {
      setSubmitted(true);
      localStorage.removeItem(startTimeKey);
      localStorage.removeItem(answersKey);
      localStorage.setItem(`completed_quiz_${quiz.id}`, "true");
    },
    onError: (err: Error) => {
      submittingRef.current = false;
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = useCallback(() => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    submitMutation.mutate({ studentId, quizId: quiz.id, answers });
  }, [studentId, quiz.id, answers, submitMutation]);

  const handleTimeUp = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

  const selectAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md text-center p-10">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2 gradient-text" data-testid="text-submission-success">
            Examination Submitted
          </h2>
          <p className="text-slate-400 mb-6">
            Your answers have been recorded. Thank you for completing the examination.
          </p>
          <Link href="/">
            <Button className="glow-button" data-testid="button-back-home">
              <Home className="w-4 h-4 mr-1.5" />
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (showSummary) {
    const answeredCount = Object.keys(answers).length;
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-white/[0.03] backdrop-blur-lg border-b border-white/5 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <h2 className="font-bold text-lg text-slate-100">Review & Submit</h2>
            <Timer startTime={startTime} timeLimitMinutes={quiz.timeLimitMinutes} onTimeUp={handleTimeUp} />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="glass-card p-6">
            <div className="mb-4">
              <h3 className="font-semibold text-lg text-slate-100">Answer Summary</h3>
              <p className="text-sm text-slate-400 mt-1">
                {answeredCount} of {questions.length} questions answered
              </p>
            </div>
            <div>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 mb-6">
                {questions.map((q, idx) => {
                  const isAnswered = answers[q.id] !== undefined;
                  return (
                    <button
                      key={q.id}
                      onClick={() => { setCurrentIndex(idx); setShowSummary(false); }}
                      className={`w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium border transition-all ${
                        isAnswered
                          ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
                          : "bg-white/5 border-white/10 text-slate-500"
                      }`}
                      data-testid={`button-summary-q-${idx + 1}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-400 mb-6">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-violet-400" /> Answered</span>
                <span className="flex items-center gap-1.5"><Circle className="w-4 h-4" /> Unanswered</span>
              </div>
              <div className="flex gap-3">
                <Button className="glow-button-outline" onClick={() => setShowSummary(false)} data-testid="button-back-to-questions">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Questions
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="flex-1 glow-button"
                  data-testid="button-final-submit"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  {submitMutation.isPending ? "Submitting..." : "Submit Examination"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const optionLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-white/[0.03] backdrop-blur-lg border-b border-white/5 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold truncate max-w-[200px] text-slate-200">{quiz.title}</span>
            <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/30">
              Q{currentIndex + 1}/{questions.length}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-500" />
            <Timer startTime={startTime} timeLimitMinutes={quiz.timeLimitMinutes} onTimeUp={handleTimeUp} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="glass-card p-6 md:p-8 mb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h3 className="text-lg font-semibold text-slate-100" data-testid={`text-question-number-${currentIndex + 1}`}>
              Question {currentIndex + 1}
            </h3>
            <span className="text-sm font-bold whitespace-nowrap bg-violet-500/10 text-violet-300 px-3 py-1 rounded-lg border border-violet-500/20" data-testid={`text-marks-${currentIndex + 1}`}>
              [{question.marksWorth}]
            </span>
          </div>

          <div className="text-base leading-relaxed mb-6 text-slate-200" data-testid={`text-question-prompt-${currentIndex + 1}`}>
            {renderLatex(question.promptText)}
          </div>

          {question.imageUrl && (
            <div className="flex justify-center mb-6">
              <img
                src={question.imageUrl}
                alt={`Diagram for question ${currentIndex + 1}`}
                className="max-w-full max-h-96 object-contain rounded-lg border border-white/10"
                data-testid={`img-question-${currentIndex + 1}`}
              />
            </div>
          )}

          <div className="space-y-3">
            {question.options.map((option, idx) => {
              const isSelected = answers[question.id] === option;
              return (
                <button
                  key={idx}
                  onClick={() => selectAnswer(question.id, option)}
                  className={`w-full text-left rounded-xl border-2 p-4 flex items-start gap-3 transition-all duration-200 ${
                    isSelected
                      ? "border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                      : "border-white/10 bg-white/[0.02] hover:border-violet-500/30 hover:bg-white/5"
                  }`}
                  data-testid={`button-option-${optionLabels[idx]}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold transition-colors ${
                    isSelected
                      ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
                      : "bg-white/5 text-slate-400 border border-white/10"
                  }`}>
                    {optionLabels[idx]}
                  </span>
                  <span className="pt-1 text-slate-200">
                    {renderLatex(option)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-4">
          <Button
            className="glow-button-outline"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            data-testid="button-prev-question"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <div className="flex gap-1.5">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  idx === currentIndex
                    ? "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)]"
                    : answers[q.id] !== undefined
                    ? "bg-violet-500/40"
                    : "bg-white/10"
                }`}
                data-testid={`button-dot-${idx + 1}`}
              />
            ))}
          </div>

          {currentIndex === questions.length - 1 ? (
            <Button className="glow-button" onClick={() => setShowSummary(true)} data-testid="button-review-submit">
              Review & Submit
              <Send className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              className="glow-button"
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              data-testid="button-next-question"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  const params = useParams<{ id: string }>();
  const quizId = parseInt(params.id || "0");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [entryError, setEntryError] = useState("");

  if (!Number.isFinite(quizId) || quizId <= 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card w-full max-w-md text-center p-10">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400/60 mb-3" />
          <h2 className="text-xl font-bold text-slate-100">Invalid Quiz Link</h2>
          <p className="text-sm text-slate-400 mt-2">Please use a valid quiz URL.</p>
        </div>
      </div>
    );
  }

  const { data: quiz, isLoading: quizLoading, error: quizError } = useQuery<Quiz>({
    queryKey: ["/api/quizzes", quizId],
  });

  const { data: questions, isLoading: questionsLoading, error: questionsError } = useQuery<Question[]>({
    queryKey: ["/api/quizzes", quizId, "questions"],
    enabled: started,
  });

  useEffect(() => {
    const completedKey = `completed_quiz_${quizId}`;
    if (localStorage.getItem(completedKey) === "true") {
      setBlocked(true);
    }
  }, [quizId]);

  const handleStart = async (firstName: string, lastName: string) => {
    setChecking(true);
    setEntryError("");
    try {
      const res = await apiRequest("POST", "/api/check-submission", { quizId, firstName, lastName });
      const data = await res.json();
      if (data.hasSubmitted) {
        setBlocked(true);
        localStorage.setItem(`completed_quiz_${quizId}`, "true");
        return;
      }
      const studentRes = await apiRequest("POST", "/api/students", { firstName, lastName });
      const studentData = await studentRes.json();
      setStudentId(studentData.id);
      setStarted(true);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (message.includes("404")) {
        setEntryError("Quiz not found. Please verify the quiz link.");
      } else {
        setEntryError("Could not start the quiz. Please try again.");
      }
      return;
    } finally {
      setChecking(false);
    }
  };

  if (quizLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-3/4 mx-auto bg-white/10" />
          <Skeleton className="h-40 w-full bg-white/10" />
        </div>
      </div>
    );
  }

  if (quizError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card w-full max-w-md text-center p-10">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400/60 mb-3" />
          <h2 className="text-xl font-bold text-slate-100">Unable to Load Quiz</h2>
          <p className="text-sm text-slate-400 mt-2">{String((quizError as Error).message || "Please try again.")}</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card w-full max-w-md text-center p-10">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400/60 mb-3" />
          <h2 className="text-xl font-bold text-slate-100">Quiz Not Found</h2>
          <p className="text-sm text-slate-400 mt-2">This examination does not exist.</p>
          <Link href="/">
            <Button className="glow-button-outline mt-4" data-testid="button-back-home-notfound">
              <Home className="w-4 h-4 mr-1.5" />
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (blocked) {
    return <AlreadyTakenScreen quizTitle={quiz.title} />;
  }

  if (!started || !studentId) {
    return <EntryGate quiz={quiz} onStart={handleStart} checking={checking} error={entryError} />;
  }

  if (questionsError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card w-full max-w-md text-center p-10">
          <AlertCircle className="w-12 h-12 mx-auto text-red-400/60 mb-3" />
          <h2 className="text-xl font-bold text-slate-100">Unable to Start Quiz</h2>
          <p className="text-sm text-slate-400 mt-2">{String((questionsError as Error).message || "Please try again.")}</p>
        </div>
      </div>
    );
  }

  if (questionsLoading || !questions) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton className="h-6 w-48 mx-auto bg-white/10" />
          <Skeleton className="h-40 w-80 bg-white/10" />
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card w-full max-w-md text-center p-10">
          <AlertCircle className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h2 className="text-xl font-bold text-slate-100">No Questions</h2>
          <p className="text-sm text-slate-400 mt-2">This examination has no questions yet.</p>
        </div>
      </div>
    );
  }

  return <ExamView quiz={quiz} questions={questions} studentId={studentId} />;
}
