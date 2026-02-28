import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SomaQuiz } from "@shared/schema";
import {
  LogOut, Users, BookOpen, Plus, UserPlus, X,
  Loader2, Check, ChevronDown, Sparkles, AlertTriangle, Trash2,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";

interface SomaUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

interface QuizAssignment {
  id: number;
  quizId: number;
  studentId: string;
  status: string;
  student: SomaUser;
}

const CARD_CLASS = "bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl";

export default function TutorDashboard() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"students" | "quizzes">("students");
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<number | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [deleteQuizId, setDeleteQuizId] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split("@")[0] || "Tutor";

  const headers = useMemo(() => ({ "x-tutor-id": userId || "" }), [userId]);

  // Fetch adopted students
  const { data: adoptedStudents = [], isLoading: studentsLoading } = useQuery<SomaUser[]>({
    queryKey: ["/api/tutor/students", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch("/api/tutor/students", { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  // Fetch available students for adoption
  const { data: availableStudents = [] } = useQuery<SomaUser[]>({
    queryKey: ["/api/tutor/students/available", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch("/api/tutor/students/available", { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId && showAdoptModal,
  });

  // Fetch tutor's quizzes
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

  // Adopt students mutation
  const adoptMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      const res = await fetch("/api/tutor/students/adopt", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds }),
      });
      if (!res.ok) throw new Error("Failed to adopt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tutor/students/available"] });
      setShowAdoptModal(false);
      setSelectedStudentIds(new Set());
    },
  });

  // Remove student mutation
  const removeMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await fetch(`/api/tutor/students/${studentId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tutor/students/available"] });
    },
  });

  // Assign quiz mutation
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

  // Delete quiz mutation
  const deleteQuizMutation = useMutation({
    mutationFn: async (quizId: number) => {
      const res = await fetch(`/api/tutor/quizzes/${quizId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutor/quizzes"] });
      setDeleteQuizId(null);
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  const toggleStudentSelection = useCallback((id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <img src="/MCEC - White Logo.png" alt="MCEC Logo" loading="lazy" className="h-10 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-bold gradient-text">SOMA</h1>
                <p className="text-[10px] text-slate-400 tracking-widest uppercase">Tutor Dashboard</p>
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
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-slate-300 transition-colors p-2 min-h-[44px] min-w-[44px]"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("students")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === "students"
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60"
            }`}
          >
            <Users className="w-4 h-4" />
            My Students
          </button>
          <button
            onClick={() => setActiveTab("quizzes")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === "quizzes"
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                : "bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:bg-slate-800/60"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            My Quizzes
          </button>
        </div>

        {/* Students Tab */}
        {activeTab === "students" && (
          <section className={CARD_CLASS}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-200">My Students</h2>
              <button
                onClick={() => { setShowAdoptModal(true); setSelectedStudentIds(new Set()); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                Adopt Students
              </button>
            </div>

            {studentsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
              </div>
            ) : adoptedStudents.length === 0 ? (
              <div className="bg-slate-800/30 rounded-xl p-8 text-center border border-slate-800/50">
                <Users className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">No students adopted yet</p>
                <p className="text-xs text-slate-500 mt-1">Click "Adopt Students" to claim registered students</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {adoptedStudents.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-xl px-5 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xs font-bold text-emerald-300">
                        {(student.displayName || student.email)[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{student.displayName || "Student"}</p>
                        <p className="text-xs text-slate-400">{student.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeMutation.mutate(student.id)}
                      className="text-red-400/60 hover:text-red-400 transition-colors p-1"
                      title="Remove student"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Quizzes Tab */}
        {activeTab === "quizzes" && (
          <section className={CARD_CLASS}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-200">My Quizzes</h2>
            </div>

            {quizzesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
              </div>
            ) : tutorQuizzes.length === 0 ? (
              <div className="bg-slate-800/30 rounded-xl p-8 text-center border border-slate-800/50">
                <BookOpen className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">No quizzes created yet</p>
                <p className="text-xs text-slate-500 mt-1">Use the Admin panel to generate quizzes through the Copilot</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {tutorQuizzes.map((quiz) => (
                  <div
                    key={quiz.id}
                    className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-xl px-5 py-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          quiz.status === "published" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {quiz.status}
                        </span>
                        {quiz.subject && (
                          <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-slate-800/60">
                            {quiz.subject}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-slate-200 truncate">{quiz.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{quiz.topic} | {quiz.level}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={() => { setShowAssignModal(quiz.id); setSelectedStudentIds(new Set()); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        Assign
                      </button>
                      <button
                        onClick={() => setDeleteQuizId(quiz.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-all"
                        title="Delete quiz"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Adopt Students Modal */}
      {showAdoptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAdoptModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-200">Adopt Students</h3>
              <button onClick={() => setShowAdoptModal(false)} className="text-slate-400 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {availableStudents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No students available for adoption</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {availableStudents.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => toggleStudentSelection(student.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                        selectedStudentIds.has(student.id)
                          ? "bg-violet-500/20 border border-violet-500/40"
                          : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        selectedStudentIds.has(student.id)
                          ? "bg-violet-500 border-violet-500"
                          : "border-slate-600"
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
                  onClick={() => adoptMutation.mutate(Array.from(selectedStudentIds))}
                  disabled={selectedStudentIds.size === 0 || adoptMutation.isPending}
                  className="w-full mt-4 py-3 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {adoptMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    `Adopt ${selectedStudentIds.size} Student${selectedStudentIds.size !== 1 ? "s" : ""}`
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Assign Quiz Modal */}
      {showAssignModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAssignModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-200">Assign Quiz to Students</h3>
              <button onClick={() => setShowAssignModal(null)} className="text-slate-400 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Select from your adopted students to assign this quiz:
            </p>

            {adoptedStudents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">You have no adopted students. Adopt students first.</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {adoptedStudents.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => toggleStudentSelection(student.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                        selectedStudentIds.has(student.id)
                          ? "bg-emerald-500/20 border border-emerald-500/40"
                          : "bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        selectedStudentIds.has(student.id)
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-slate-600"
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
                  className="w-full mt-4 py-3 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

      {/* Delete Quiz Confirmation Dialog */}
      <AlertDialog open={deleteQuizId !== null}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <AlertDialogTitle className="text-red-300">Delete Quiz</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-slate-400">
              This action cannot be undone. All quiz data and student assignments will be deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteQuizId) deleteQuizMutation.mutate(deleteQuizId);
              }}
              disabled={deleteQuizMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteQuizMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
