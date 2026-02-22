import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Quiz, Question } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Clock, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2,
  Circle, Send, ArrowLeft, GraduationCap, Home, ShieldAlert, Loader2
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
      <Card className="w-full max-w-md text-center">
        <CardContent className="py-12">
          <ShieldAlert className="w-16 h-16 mx-auto text-destructive/60 mb-4" />
          <h2 className="font-serif text-2xl font-bold mb-2" data-testid="text-already-taken">
            This test has already been taken.
          </h2>
          <p className="text-muted-foreground mb-6">
            You have already submitted your answers for "{quizTitle}". Each student is allowed only one attempt.
          </p>
          <Link href="/">
            <Button data-testid="button-back-home-taken">
              <Home className="w-4 h-4 mr-1.5" />
              Return Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function EntryGate({ quiz, onStart, checking }: { quiz: Quiz; onStart: (firstName: string, lastName: string, pin: string) => void; checking: boolean }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pin, setPin] = useState("");

  const isClosed = new Date(quiz.dueDate) < new Date();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !pin.trim() || checking) return;
    onStart(firstName.trim(), lastName.trim(), pin.trim().toUpperCase());
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center pb-4">
          <div className="w-16 h-16 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="font-serif text-2xl" data-testid="text-quiz-entry-title">{quiz.title}</CardTitle>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{quiz.timeLimitMinutes} minutes</span>
          </div>
        </CardHeader>
        <CardContent>
          {isClosed ? (
            <div className="text-center py-6">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive/60 mb-3" />
              <h3 className="font-serif text-lg font-semibold text-destructive">Examination Closed</h3>
              <p className="text-sm text-muted-foreground mt-2">
                This examination closed on {new Date(quiz.dueDate).toLocaleDateString()}.
              </p>
              <Link href="/">
                <Button variant="outline" className="mt-4" data-testid="button-back-home-closed">
                  <Home className="w-4 h-4 mr-1.5" />
                  Return Home
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-muted/50 rounded-md p-4 text-sm space-y-1">
                <p className="font-medium">Instructions:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>You have <strong>{quiz.timeLimitMinutes} minutes</strong> to complete this examination.</li>
                  <li>The timer will start as soon as you click "Begin".</li>
                  <li>If you refresh, the timer will <strong>not</strong> reset.</li>
                  <li>The examination will auto-submit when time expires.</li>
                  <li>You are allowed <strong>one attempt only</strong>.</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quizPin">Quiz PIN</Label>
                <Input
                  id="quizPin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.toUpperCase())}
                  placeholder="Enter 5-character PIN"
                  maxLength={5}
                  data-testid="input-quiz-pin"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={!firstName.trim() || !lastName.trim() || !pin.trim() || checking} data-testid="button-begin-quiz">
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
        </CardContent>
      </Card>
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
      className={`font-mono text-lg font-bold tabular-nums ${isCritical ? "text-destructive animate-pulse" : isLow ? "text-orange-500 dark:text-orange-400" : ""}`}
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
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <CheckCircle2 className="w-16 h-16 mx-auto text-primary mb-4" />
            <h2 className="font-serif text-2xl font-bold mb-2" data-testid="text-submission-success">
              Examination Submitted
            </h2>
            <p className="text-muted-foreground mb-6">
              Your answers have been recorded. Thank you for completing the examination.
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">
                <Home className="w-4 h-4 mr-1.5" />
                Return Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showSummary) {
    const answeredCount = Object.keys(answers).length;
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-card border-b px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <h2 className="font-serif font-bold text-lg">Review & Submit</h2>
            <Timer startTime={startTime} timeLimitMinutes={quiz.timeLimitMinutes} onTimeUp={handleTimeUp} />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif">Answer Summary</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {answeredCount} of {questions.length} questions answered
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 mb-6">
                {questions.map((q, idx) => {
                  const isAnswered = answers[q.id] !== undefined;
                  return (
                    <button
                      key={q.id}
                      onClick={() => { setCurrentIndex(idx); setShowSummary(false); }}
                      className={`w-full aspect-square rounded-md flex items-center justify-center text-sm font-medium border transition-colors ${
                        isAnswered
                          ? "bg-primary/10 border-primary/30 text-foreground"
                          : "bg-muted/50 border-border text-muted-foreground"
                      }`}
                      data-testid={`button-summary-q-${idx + 1}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Answered</span>
                <span className="flex items-center gap-1.5"><Circle className="w-4 h-4" /> Unanswered</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowSummary(false)} data-testid="button-back-to-questions">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Questions
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  className="flex-1"
                  data-testid="button-final-submit"
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  {submitMutation.isPending ? "Submitting..." : "Submit Examination"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const question = questions[currentIndex];
  const optionLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-card border-b px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-serif font-bold truncate max-w-[200px]">{quiz.title}</span>
            <Badge variant="secondary">
              Q{currentIndex + 1}/{questions.length}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Timer startTime={startTime} timeLimitMinutes={quiz.timeLimitMinutes} onTimeUp={handleTimeUp} />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h3 className="font-serif text-lg font-semibold" data-testid={`text-question-number-${currentIndex + 1}`}>
              Question {currentIndex + 1}
            </h3>
            <span className="text-sm font-bold font-serif whitespace-nowrap bg-muted/70 px-3 py-1 rounded-md" data-testid={`text-marks-${currentIndex + 1}`}>
              [{question.marksWorth}]
            </span>
          </div>

          <div className="font-serif text-base leading-relaxed mb-6" style={{ fontFamily: "'Source Serif 4', 'Times New Roman', serif" }} data-testid={`text-question-prompt-${currentIndex + 1}`}>
            {renderLatex(question.promptText)}
          </div>

          {question.imageUrl && (
            <div className="flex justify-center mb-6">
              <img
                src={question.imageUrl}
                alt={`Diagram for question ${currentIndex + 1}`}
                className="max-w-full max-h-96 object-contain rounded-md border"
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
                  className={`w-full text-left rounded-md border-2 p-4 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  data-testid={`button-option-${optionLabels[idx]}`}
                >
                  <span className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-sm font-bold ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {optionLabels[idx]}
                  </span>
                  <span className="font-serif pt-1" style={{ fontFamily: "'Source Serif 4', 'Times New Roman', serif" }}>
                    {renderLatex(option)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <Button
            variant="outline"
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
                    ? "bg-primary"
                    : answers[q.id] !== undefined
                    ? "bg-primary/40"
                    : "bg-muted"
                }`}
                data-testid={`button-dot-${idx + 1}`}
              />
            ))}
          </div>

          {currentIndex === questions.length - 1 ? (
            <Button onClick={() => setShowSummary(true)} data-testid="button-review-submit">
              Review & Submit
              <Send className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
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
  const [quizPin, setQuizPin] = useState("");

  const { data: quiz, isLoading: quizLoading } = useQuery<Quiz>({
    queryKey: ["/api/quizzes", quizId],
  });

  const { data: questions, isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/quizzes", quizId, "questions", quizPin],
    queryFn: async () => {
      const res = await fetch(`/api/quizzes/${quizId}/questions?pin=${encodeURIComponent(quizPin)}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Failed to load questions");
      }
      return res.json();
    },
    enabled: started && Boolean(quizPin),
  });

  useEffect(() => {
    const completedKey = `completed_quiz_${quizId}`;
    if (localStorage.getItem(completedKey) === "true") {
      setBlocked(true);
    }
  }, [quizId]);

  const registerMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      const res = await apiRequest("POST", "/api/students", data);
      return res.json();
    },
    onSuccess: (data: { id: number }) => {
      setStudentId(data.id);
      setStarted(true);
    },
  });

  const handleStart = async (firstName: string, lastName: string, pin: string) => {
    setChecking(true);
    try {
      const res = await apiRequest("POST", "/api/check-submission", { quizId, firstName, lastName, pin });
      const data = await res.json();
      if (data.hasSubmitted) {
        setBlocked(true);
        localStorage.setItem(`completed_quiz_${quizId}`, "true");
        return;
      }
      setQuizPin(pin);
      registerMutation.mutate({ firstName, lastName });
    } catch {
      setQuizPin(pin);
      registerMutation.mutate({ firstName, lastName });
    } finally {
      setChecking(false);
    }
  };

  if (quizLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-3/4 mx-auto" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive/60 mb-3" />
            <h2 className="font-serif text-xl font-bold">Quiz Not Found</h2>
            <p className="text-sm text-muted-foreground mt-2">This examination does not exist.</p>
            <Link href="/">
              <Button variant="outline" className="mt-4" data-testid="button-back-home-notfound">
                <Home className="w-4 h-4 mr-1.5" />
                Return Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (blocked) {
    return <AlreadyTakenScreen quizTitle={quiz.title} />;
  }

  if (!started || !studentId) {
    return <EntryGate quiz={quiz} onStart={handleStart} checking={checking} />;
  }

  if (questionsLoading || !questions) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-40 w-80" />
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h2 className="font-serif text-xl font-bold">No Questions</h2>
            <p className="text-sm text-muted-foreground mt-2">This examination has no questions yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ExamView quiz={quiz} questions={questions} studentId={studentId} />;
}
