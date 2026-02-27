import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { authFetch } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Home, AlertCircle, Loader2, CheckCircle2, XCircle, BookOpen, Award,
} from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface ReviewQuestion {
  id: number;
  stem: string;
  options: string[];
  correctAnswer: string;
  marks: number;
  explanation: string | null;
}

interface ReviewReport {
  id: number;
  quizId: number;
  studentName: string;
  score: number;
  status: string;
  answersJson: Record<string, string> | null;
  createdAt: string;
  quiz: { id: number; title: string; topic: string | null };
}

interface ReviewData {
  report: ReviewReport;
  questions: ReviewQuestion[];
}

export default function SomaQuizReview() {
  const reportRef = useRef<HTMLDivElement>(null);
  const params = useParams<{ reportId: string }>();
  const reportId = parseInt(params.reportId || "0");

  const { data, isLoading, error } = useQuery<ReviewData>({
    queryKey: ["/api/soma/reports", reportId, "review"],
    queryFn: async () => {
      const res = await authFetch(`/api/soma/reports/${reportId}/review`);
      if (!res.ok) throw new Error("Failed to load review data");
      return res.json();
    },
    enabled: reportId > 0,
  });

  const studentAnswers: Record<string, string> = useMemo(() => {
    if (!data?.report?.answersJson) return {};
    return data.report.answersJson;
  }, [data]);

  const totalMarks = useMemo(() => {
    if (!data?.questions) return 0;
    return data.questions.reduce((s, q) => s + q.marks, 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-3xl space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-6">
              <Skeleton className="h-6 w-3/4 mb-4 bg-white/10" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-12 w-full bg-white/10" />
                ))}
              </div>
            </div>
          ))}
          <div className="flex justify-center">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
              <span className="text-sm text-slate-400">Loading review...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="glass-card w-full max-w-md text-center p-10">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5 border border-red-500/30">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-slate-100">Failed to Load Review</h2>
          <p className="text-sm text-slate-400 mb-6">{(error as Error)?.message || "Review data not available"}</p>
          <Link href="/dashboard">
            <Button className="glow-button" data-testid="button-review-error-back">
              <Home className="w-4 h-4 mr-1.5" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { report, questions } = data;
  const percentage = totalMarks > 0 ? Math.round((report.score / totalMarks) * 100) : 0;

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf().set({
      margin: 10,
      filename: `${report.quiz.title.replace(/\s+/g, "-")}-report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).from(reportRef.current).save();
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-3xl mx-auto" ref={reportRef}>
        <div className="flex items-center justify-between mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200" data-testid="button-review-back">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Dashboard
            </Button>
          </Link>
          <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/30" data-testid="badge-review-mode">
            Review Mode
          </Badge>
          <Button className="glow-button min-h-[44px]" size="sm" onClick={downloadPdf} data-testid="button-download-report">
            Download Report
          </Button>
        </div>

        <div className="glass-card p-8 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
              <BookOpen className="w-5 h-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold gradient-text" data-testid="text-review-title">{report.quiz.title}</h2>
              <p className="text-xs text-slate-400">{report.quiz.topic}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
              <p className="text-2xl font-bold text-violet-300" data-testid="text-review-percentage">{percentage}%</p>
              <p className="text-xs text-slate-400">Score</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
              <p className="text-2xl font-bold text-slate-300" data-testid="text-review-marks">{report.score}/{totalMarks}</p>
              <p className="text-xs text-slate-400">Marks</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
              <p className="text-2xl font-bold text-cyan-300" data-testid="text-review-total-q">{questions.length}</p>
              <p className="text-xs text-slate-400">Questions</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {questions.map((q, idx) => {
            const studentAnswer = studentAnswers[String(q.id)] || null;
            const isCorrect = studentAnswer === q.correctAnswer;

            return (
              <div key={q.id} className="glass-card p-6" data-testid={`review-question-${idx + 1}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-cyan-500/20 flex items-center justify-center border border-violet-500/30 text-sm font-bold text-violet-300">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Question {idx + 1}</p>
                  </div>
                  <Badge className={`text-xs ${isCorrect ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : studentAnswer ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-slate-500/10 text-slate-400 border-slate-500/30"}`}>
                    {isCorrect ? "Correct" : studentAnswer ? "Incorrect" : "Skipped"} [{q.marks}]
                  </Badge>
                </div>

                <div className="text-base text-slate-100 leading-relaxed mb-4" data-testid={`text-review-stem-${idx + 1}`}>
                  <MarkdownRenderer content={q.stem} />
                </div>

                <div className="grid gap-2.5">
                  {q.options.map((option, optIdx) => {
                    const letter = String.fromCharCode(65 + optIdx);
                    const isCorrectOption = option === q.correctAnswer;
                    const isStudentWrongPick = option === studentAnswer && !isCorrectOption;

                    let optionClasses = "bg-white/[0.03] border-white/10";
                    let ringClasses = "";
                    let iconEl = null;

                    if (isCorrectOption) {
                      optionClasses = "bg-green-500/20 border-green-500/40";
                      ringClasses = "ring-2 ring-green-500";
                      iconEl = <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
                    } else if (isStudentWrongPick) {
                      optionClasses = "bg-red-500/20 border-red-500/40";
                      ringClasses = "ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]";
                      iconEl = <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${optionClasses} ${ringClasses}`}
                        data-testid={`review-option-${idx + 1}-${optIdx}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                            isCorrectOption
                              ? "bg-green-500/30 text-green-200 border border-green-500/50"
                              : isStudentWrongPick
                                ? "bg-red-500/30 text-red-200 border border-red-500/50"
                                : "bg-white/5 text-slate-400 border border-white/10"
                          }`}>
                            {letter}
                          </div>
                          <div className={`text-sm pt-0.5 flex-1 ${
                            isCorrectOption ? "text-green-200" : isStudentWrongPick ? "text-red-200" : "text-slate-300"
                          }`}>
                            <MarkdownRenderer content={option} />
                          </div>
                          {iconEl}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isCorrect && studentAnswer && q.explanation && (
                  <div className="mt-4 p-4 rounded-r-xl bg-red-500/10 border-l-4 border-red-500" data-testid={`review-explanation-${idx + 1}`}>
                    <p className="text-xs font-semibold text-red-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Why this was wrong
                    </p>
                    <div className="text-sm text-slate-300 leading-relaxed">
                      <MarkdownRenderer content={q.explanation} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Link href="/dashboard">
            <Button className="glow-button min-h-[44px]" data-testid="button-review-done">
              <Home className="w-4 h-4 mr-1.5" />
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
