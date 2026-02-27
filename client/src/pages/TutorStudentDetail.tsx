import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { getSubjectColor, getSubjectIcon } from "@/lib/subjectColors";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@supabase/supabase-js";
import type { SomaQuiz, Quiz } from "@shared/schema";
import {
  ArrowLeft, MessageSquare, Send, Loader2, BookOpen,
  CheckCircle2, XCircle, Clock, Award,
} from "lucide-react";

const CARD_CLASS = "bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl";

interface ReportWithQuiz {
  id: number;
  quizId: number;
  studentName: string;
  score: number;
  maxScore: number;
  status: string;
  aiFeedbackHtml: string | null;
  createdAt: string;
  quiz: SomaQuiz;
}

interface SubmissionWithQuiz {
  id: number;
  totalScore: number;
  maxPossibleScore: number;
  submittedAt: string;
  quiz: Quiz;
}

interface TutorComment {
  id: number;
  comment: string;
  createdAt: string;
}

interface StudentInfo {
  id: string;
  email: string;
  displayName: string | null;
}

export default function TutorStudentDetail() {
  const params = useParams<{ id: string }>();
  const studentId = params.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const headers = useMemo(() => ({ "x-tutor-id": userId || "" }), [userId]);

  const { data: adoptedStudents = [] } = useQuery<StudentInfo[]>({
    queryKey: ["/api/tutor/students", userId],
    queryFn: async () => {
      const res = await fetch("/api/tutor/students", { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const student = adoptedStudents.find((s) => s.id === studentId);

  const { data: performance, isLoading: perfLoading } = useQuery<{ reports: ReportWithQuiz[]; submissions: SubmissionWithQuiz[] }>({
    queryKey: ["/api/tutor/students", studentId, "performance"],
    queryFn: async () => {
      const res = await fetch(`/api/tutor/students/${studentId}/performance`, { headers });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!userId && !!studentId,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<TutorComment[]>({
    queryKey: ["/api/tutor/students", studentId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/tutor/students/${studentId}/comments`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId && !!studentId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const res = await fetch(`/api/tutor/students/${studentId}/comments`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error("Failed to add comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor/students", studentId, "comments"] });
      setNewComment("");
      toast({ title: "Note saved" });
    },
  });

  const displayName = student?.displayName || student?.email?.split("@")[0] || "Student";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const allResults = useMemo(() => {
    const items: { title: string; subject: string | null; score: number; maxScore: number; date: string; type: string }[] = [];
    for (const r of performance?.reports || []) {
      items.push({ title: r.quiz?.title || "Quiz", subject: r.quiz?.subject || null, score: r.score, maxScore: r.maxScore || 0, date: r.createdAt, type: "soma" });
    }
    for (const s of performance?.submissions || []) {
      items.push({ title: s.quiz?.title || "Quiz", subject: (s.quiz as any)?.subject || null, score: s.totalScore, maxScore: s.maxPossibleScore, date: s.submittedAt, type: "legacy" });
    }
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [performance]);

  const avgScore = useMemo(() => {
    const withMax = allResults.filter((r) => r.maxScore > 0);
    if (withMax.length === 0) return null;
    return Math.round(withMax.reduce((s, r) => s + (r.score / r.maxScore) * 100, 0) / withMax.length);
  }, [allResults]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/tutor/students">
            <span className="flex items-center gap-2 text-sm text-slate-400 hover:text-violet-400 transition-colors cursor-pointer" data-testid="link-back-students">
              <ArrowLeft className="w-4 h-4" />
              Back to Students
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className={CARD_CLASS}>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: "rgba(16,185,129,0.2)", boxShadow: "0 0 20px rgba(16,185,129,0.3)", border: "2px solid #10B981" }}
            >
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100" data-testid="text-student-name">{displayName}</h2>
              <p className="text-xs text-slate-400">{student?.email}</p>
            </div>
            <div className="ml-auto flex items-center gap-4">
              {avgScore !== null && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-violet-300">{avgScore}%</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Avg Score</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-300">{allResults.length}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Assessments</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Assessment History</h3>
            {perfLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full bg-white/5 rounded-xl" />)}
              </div>
            ) : allResults.length === 0 ? (
              <div className={`${CARD_CLASS} text-center py-10`}>
                <BookOpen className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">No assessment results yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allResults.map((r, idx) => {
                  const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : null;
                  const sc = getSubjectColor(r.subject);
                  const SubIcon = getSubjectIcon(r.subject);
                  return (
                    <div key={idx} className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-4 flex items-center gap-4" data-testid={`result-${idx}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${sc.border}`} style={{ backgroundColor: `${sc.hex}15` }}>
                        <SubIcon className="w-5 h-5" style={{ color: sc.hex }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{r.title}</p>
                        <p className="text-xs text-slate-400">{format(new Date(r.date), "PPp")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {pct !== null ? (
                          <>
                            <p className={`text-lg font-bold ${pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-red-400"}`}>{pct}%</p>
                            <p className="text-[10px] text-slate-500">{r.score}/{r.maxScore}</p>
                          </>
                        ) : (
                          <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/30 text-xs">Score: {r.score}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Private Notes
            </h3>
            <div className={CARD_CLASS}>
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                {commentsLoading ? (
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin mx-auto" />
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No notes yet. Add a private note about this student's progress.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3" data-testid={`comment-${c.id}`}>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.comment}</p>
                      <p className="text-[10px] text-slate-500 mt-1.5">{format(new Date(c.createdAt), "PPp")}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a note..."
                  className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-sm text-slate-200 placeholder:text-slate-500 resize-none min-h-[44px] focus:outline-none focus:border-violet-500/40"
                  rows={2}
                  data-testid="input-tutor-note"
                />
                <button
                  onClick={() => { if (newComment.trim()) addCommentMutation.mutate(newComment); }}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  className="self-end p-3 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-40 transition-all min-h-[44px] min-w-[44px]"
                  data-testid="button-add-note"
                >
                  {addCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
