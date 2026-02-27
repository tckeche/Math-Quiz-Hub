import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getSubjectColor, getSubjectIcon } from "@/lib/subjectColors";
import type { SomaQuiz } from "@shared/schema";
import {
  LogOut, Users, BookOpen, Plus, UserPlus, X,
  Loader2, Check, LayoutDashboard, Sparkles,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";

interface SomaUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

const CARD_CLASS = "bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl";

export default function TutorAssessments() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [, setLocation] = useLocation();
  const [showAssignModal, setShowAssignModal] = useState<number | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split("@")[0] || "Tutor";
  const headers = useMemo(() => ({ "x-tutor-id": userId || "" }), [userId]);
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const { data: tutorQuizzes = [], isLoading: quizzesLoading } = useQuery<SomaQuiz[]>({
    queryKey: ["/api/tutor/quizzes", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch("/api/tutor/quizzes", { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: adoptedStudents = [] } = useQuery<SomaUser[]>({
    queryKey: ["/api/tutor/students", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch("/api/tutor/students", { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ quizId, studentIds }: { quizId: number; studentIds: string[] }) => {
      const res = await fetch(`/api/tutor/quizzes/${quizId}/assign`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      return res.json();
    },
    onSuccess: () => {
      setShowAssignModal(null);
      setSelectedStudentIds(new Set());
    },
  });

  const toggleStudentSelection = useCallback((id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img src="/MCEC - White Logo.png" alt="MCEC Logo" loading="lazy" className="h-10 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-bold gradient-text">SOMA</h1>
                <p className="text-[10px] text-slate-400 tracking-widest uppercase">Tutor Portal</p>
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: "rgba(139,92,246,0.3)", boxShadow: "0 0 16px rgba(139,92,246,0.3)", border: "2px solid #8B5CF6" }}
              >
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-slate-200">{displayName}</p>
                <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">Tutor</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-slate-300 transition-colors p-2 min-h-[44px] min-w-[44px]" aria-label="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-800/40 bg-slate-950/40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          <Link href="/tutor">
            <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent transition-all cursor-pointer" data-testid="nav-dashboard">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </span>
          </Link>
          <Link href="/tutor/students">
            <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent transition-all cursor-pointer" data-testid="nav-students">
              <Users className="w-4 h-4" />
              Students
            </span>
          </Link>
          <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-violet-300 border-b-2 border-violet-500 cursor-default" data-testid="nav-assessments">
            <BookOpen className="w-4 h-4" />
            Assessments
          </span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">My Assessments</h2>
          <p className="text-sm text-slate-400 mt-1">{tutorQuizzes.length} assessment{tutorQuizzes.length !== 1 ? "s" : ""} created</p>
        </div>

        {quizzesLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
        ) : tutorQuizzes.length === 0 ? (
          <div className={`${CARD_CLASS} text-center py-12`}>
            <BookOpen className="w-12 h-12 mx-auto text-slate-600 mb-4" />
            <p className="text-sm text-slate-400">No assessments created yet</p>
            <p className="text-xs text-slate-500 mt-1">Use the Create Assessment button on your Dashboard to generate assessments with the AI Copilot</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {tutorQuizzes.map((quiz) => {
              const sc = getSubjectColor(quiz.subject);
              const SubIcon = getSubjectIcon(quiz.subject);
              return (
                <div
                  key={quiz.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl px-5 py-4"
                  data-testid={`quiz-card-${quiz.id}`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${sc.border} shrink-0`} style={{ backgroundColor: `${sc.hex}15` }}>
                      <SubIcon className="w-5 h-5" style={{ color: sc.hex }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          quiz.status === "published" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {quiz.status}
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-slate-200 truncate">{quiz.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{quiz.topic} | {quiz.level}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowAssignModal(quiz.id); setSelectedStudentIds(new Set()); }}
                    className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 transition-all sm:ml-3"
                    data-testid={`button-assign-${quiz.id}`}
                  >
                    <Plus className="w-3 h-3" />
                    Assign
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showAssignModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAssignModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-5">
              <h3 className="text-lg font-bold text-slate-200">Assign Assessment to Students</h3>
              <button onClick={() => setShowAssignModal(null)} className="text-slate-400 hover:text-slate-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Select from your adopted students to assign this assessment:</p>
            {adoptedStudents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">You have no adopted students. Adopt students first.</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {adoptedStudents.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => toggleStudentSelection(student.id)}
                      className={`w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                        selectedStudentIds.has(student.id)
                          ? "bg-emerald-500/20 border border-emerald-500/40"
                          : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60"
                      }`}
                      data-testid={`assign-student-${student.id}`}
                    >
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        selectedStudentIds.has(student.id) ? "bg-emerald-500 border-emerald-500" : "border-slate-600"
                      }`}>
                        {selectedStudentIds.has(student.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{student.displayName || "Student"}</p>
                        <p className="text-xs text-slate-400">{student.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => assignMutation.mutate({ quizId: showAssignModal, studentIds: Array.from(selectedStudentIds) })}
                  disabled={selectedStudentIds.size === 0 || assignMutation.isPending}
                  className="w-full mt-4 py-3 min-h-[44px] rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  data-testid="button-confirm-assign"
                >
                  {assignMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    `Assign to ${selectedStudentIds.size} Student${selectedStudentIds.size !== 1 ? "s" : ""}`
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
