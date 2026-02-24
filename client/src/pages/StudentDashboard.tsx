import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getSubjectColor } from "@/lib/subjectColors";
import type { Quiz, SomaQuiz } from "@shared/schema";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import {
  LogOut, BookOpen, Clock, ArrowRight, CheckCircle2,
  Loader2, AlertTriangle, Filter, ChevronDown, Sparkles, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Session } from "@supabase/supabase-js";

interface ReportWithQuiz {
  id: number;
  quizId: number;
  studentId: string | null;
  studentName: string;
  score: number;
  status: string;
  aiFeedbackHtml: string | null;
  createdAt: string;
  quiz: SomaQuiz;
}

interface SubmissionWithQuiz {
  id: number;
  studentId: number;
  quizId: number;
  totalScore: number;
  maxPossibleScore: number;
  submittedAt: string;
  quiz: Quiz;
}

const CARD_CLASS = "bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl";
const SECTION_LABEL = "text-xs font-semibold tracking-wider text-slate-400 uppercase";

function DonutCard({ subject, percentage, color }: { subject: string; percentage: number; color: string }) {
  const data = [
    { value: percentage },
    { value: 100 - percentage },
  ];
  return (
    <div className={CARD_CLASS} data-testid={`card-donut-${subject}`}>
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 relative" style={{ filter: `drop-shadow(0 4px 12px ${color}40)` }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={54}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
                strokeWidth={15}
              >
                <Cell fill={color} />
                <Cell fill="rgba(255,255,255,0.04)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-4xl font-bold text-white"
              style={{ textShadow: `0 0 20px ${color}60` }}
              data-testid={`text-donut-value-${subject}`}
            >
              {Math.round(percentage)}%
            </span>
          </div>
        </div>
        <p className={`${SECTION_LABEL} mt-3`}>{subject}</p>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [, setLocation] = useLocation();
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split("@")[0] || "Student";

  const { data: quizzes, isLoading: quizzesLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const { data: somaQuizzes, isLoading: somaLoading } = useQuery<SomaQuiz[]>({
    queryKey: ["/api/soma/quizzes"],
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery<ReportWithQuiz[]>({
    queryKey: ["/api/student/reports", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/student/reports?studentId=${userId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: submissions = [], isLoading: subsLoading } = useQuery<SubmissionWithQuiz[]>({
    queryKey: ["/api/student/submissions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/student/submissions?studentId=${userId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const completedQuizIds = useMemo(() => {
    const ids = new Set<number>();
    submissions.forEach((s) => ids.add(s.quizId));
    return ids;
  }, [submissions]);

  const completedSomaQuizIds = useMemo(() => {
    const ids = new Set<number>();
    reports.forEach((r) => ids.add(r.quizId));
    return ids;
  }, [reports]);

  const subjectStats = useMemo(() => {
    const map: Record<string, { total: number; earned: number }> = {};
    submissions.forEach((s) => {
      const subj = s.quiz.subject || "General";
      if (!map[subj]) map[subj] = { total: 0, earned: 0 };
      map[subj].total += s.maxPossibleScore;
      map[subj].earned += s.totalScore;
    });
    reports.forEach((r) => {
      const subj = r.quiz.topic || "General";
      if (!map[subj]) map[subj] = { total: 0, earned: 0 };
      map[subj].total += 100;
      map[subj].earned += r.score;
    });
    return Object.entries(map).map(([subject, { total, earned }]) => ({
      subject,
      percentage: total > 0 ? (earned / total) * 100 : 0,
    }));
  }, [submissions, reports]);

  const bestSubject = useMemo(() => {
    if (!subjectStats.length) return null;
    return subjectStats.reduce((best, curr) => curr.percentage > best.percentage ? curr : best);
  }, [subjectStats]);

  const availableQuizzes = useMemo(() => {
    const regularAvailable = (quizzes || [])
      .filter((q) => !completedQuizIds.has(q.id))
      .map((q) => ({
        id: q.id,
        title: q.title,
        subject: q.subject || "General",
        level: q.level || "",
        dueDate: q.dueDate,
        timeLimitMinutes: q.timeLimitMinutes,
        type: "regular" as const,
      }));

    const somaAvailable = (somaQuizzes || [])
      .filter((q) => q.status === "published" && !completedSomaQuizIds.has(q.id))
      .map((q) => ({
        id: q.id,
        title: q.title,
        subject: q.topic || "General",
        level: "",
        dueDate: null as any,
        timeLimitMinutes: null,
        type: "soma" as const,
      }));

    return [...regularAvailable, ...somaAvailable].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [quizzes, somaQuizzes, completedQuizIds, completedSomaQuizIds]);

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    availableQuizzes.forEach((q) => set.add(q.subject));
    return Array.from(set).sort();
  }, [availableQuizzes]);

  const allLevels = useMemo(() => {
    const set = new Set<string>();
    availableQuizzes.forEach((q) => { if (q.level) set.add(q.level); });
    return Array.from(set).sort();
  }, [availableQuizzes]);

  const filteredQuizzes = useMemo(() => {
    return availableQuizzes.filter((q) => {
      if (subjectFilter !== "all" && q.subject !== subjectFilter) return false;
      if (levelFilter !== "all" && q.level !== levelFilter) return false;
      return true;
    });
  }, [availableQuizzes, subjectFilter, levelFilter]);

  const completedItems = useMemo(() => {
    const items: {
      id: number;
      title: string;
      subject: string;
      score: number;
      maxScore: number;
      status: string;
      feedbackHtml: string | null;
      date: string;
      type: "regular" | "soma";
    }[] = [];

    submissions.forEach((s) => {
      items.push({
        id: s.id,
        title: s.quiz.title,
        subject: s.quiz.subject || "General",
        score: s.totalScore,
        maxScore: s.maxPossibleScore,
        status: "completed",
        feedbackHtml: null,
        date: s.submittedAt,
        type: "regular",
      });
    });

    reports.forEach((r) => {
      items.push({
        id: r.id,
        title: r.quiz.title,
        subject: r.quiz.topic || "General",
        score: r.score,
        maxScore: 100,
        status: r.status,
        feedbackHtml: r.aiFeedbackHtml,
        date: r.createdAt,
        type: "soma",
      });
    });

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [submissions, reports]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  const now = new Date();
  const avatarRingColor = bestSubject ? getSubjectColor(bestSubject.subject).hex : "#8B5CF6";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const isLoading = quizzesLoading || somaLoading || reportsLoading || subsLoading;

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer" data-testid="link-dashboard-home">
              <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-10 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-bold gradient-text" data-testid="text-dashboard-title">SOMA</h1>
                <p className="text-[10px] text-slate-500 tracking-widest uppercase">Student Dashboard</p>
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: "rgba(139,92,246,0.3)", boxShadow: `0 0 16px ${avatarRingColor}50`, border: `2px solid ${avatarRingColor}` }}
                data-testid="avatar-user"
              >
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-slate-200" data-testid="text-user-name">{displayName}</p>
                <p className="text-[10px] text-slate-500">{session?.user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-slate-300 transition-colors p-2"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={CARD_CLASS}>
                  <div className="flex flex-col items-center">
                    <Skeleton className="w-32 h-32 rounded-full bg-white/5" />
                    <Skeleton className="h-3 w-16 mt-3 bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className={CARD_CLASS}>
                  <Skeleton className="h-4 w-40 mb-5 bg-white/5" />
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} className="h-20 w-full mb-3 bg-white/5 rounded-xl" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {subjectStats.length > 0 && (
              <section>
                <h2 className={`${SECTION_LABEL} mb-5`} data-testid="text-section-performance">
                  Performance by Subject
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {subjectStats.map((s) => (
                    <DonutCard
                      key={s.subject}
                      subject={s.subject}
                      percentage={s.percentage}
                      color={getSubjectColor(s.subject).hex}
                    />
                  ))}
                </div>
              </section>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <section className={CARD_CLASS}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className={SECTION_LABEL} data-testid="text-section-available">
                    Available Quizzes
                  </h2>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors"
                    data-testid="button-toggle-filters"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Filters
                    <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {showFilters && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="bg-slate-800/60 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                      data-testid="select-subject-filter"
                    >
                      <option value="all">All Subjects</option>
                      {allSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {allLevels.length > 0 && (
                      <select
                        value={levelFilter}
                        onChange={(e) => setLevelFilter(e.target.value)}
                        className="bg-slate-800/60 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                        data-testid="select-level-filter"
                      >
                        <option value="all">All Levels</option>
                        {allLevels.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {filteredQuizzes.length === 0 ? (
                    <div className="bg-slate-800/30 rounded-xl p-8 text-center border border-slate-800/50">
                      <BookOpen className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500">No available quizzes</p>
                    </div>
                  ) : (
                    (showAllAvailable ? filteredQuizzes : filteredQuizzes.slice(0, 5)).map((q) => {
                      const isOverdue = q.dueDate && new Date(q.dueDate) < now;
                      const sc = getSubjectColor(q.subject);
                      return (
                        <Link
                          key={`${q.type}-${q.id}`}
                          href={q.type === "soma" ? `/soma/quiz/${q.id}` : `/quiz/${q.id}`}
                        >
                          <div
                            className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 cursor-pointer transition-all duration-300 hover:border-violet-500/40 hover:bg-slate-800/60 hover:shadow-[0_0_24px_rgba(139,92,246,0.08)] group"
                            data-testid={`card-available-quiz-${q.type}-${q.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.label}`}>
                                    {q.subject}
                                  </span>
                                  {q.level && (
                                    <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full bg-slate-800/60">
                                      {q.level}
                                    </span>
                                  )}
                                  {isOverdue && (
                                    <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]" data-testid={`badge-overdue-${q.id}`}>
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Overdue
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="text-sm font-medium text-slate-200 truncate" data-testid={`text-available-title-${q.type}-${q.id}`}>
                                  {q.title}
                                </h3>
                                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                                  {q.dueDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      Due {format(new Date(q.dueDate), "MMM d, yyyy")}
                                    </span>
                                  )}
                                  {q.timeLimitMinutes && (
                                    <span>{q.timeLimitMinutes} min</span>
                                  )}
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 transition-colors mt-1 flex-shrink-0" />
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                  {filteredQuizzes.length > 5 && (
                    <button
                      onClick={() => setShowAllAvailable(!showAllAvailable)}
                      className="w-full text-center text-xs text-violet-400 hover:text-violet-300 transition-colors py-2 mt-1"
                      data-testid="button-toggle-available"
                    >
                      {showAllAvailable ? "Show Less" : `Show More (${filteredQuizzes.length - 5} more)`}
                    </button>
                  )}
                </div>
              </section>

              <section className={CARD_CLASS}>
                <h2 className={`${SECTION_LABEL} mb-5`} data-testid="text-section-completed">
                  Completed Quizzes
                </h2>
                <div className="space-y-3">
                  {completedItems.length === 0 ? (
                    <div className="bg-slate-800/30 rounded-xl p-8 text-center border border-slate-800/50">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500">No completed quizzes yet</p>
                    </div>
                  ) : (
                    (showAllCompleted ? completedItems : completedItems.slice(0, 5)).map((item) => {
                      const sc = getSubjectColor(item.subject);
                      const pct = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : 0;
                      const isPending = item.status === "pending";
                      return (
                        <div
                          key={`${item.type}-${item.id}`}
                          className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 transition-all duration-300"
                          data-testid={`card-completed-${item.type}-${item.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <FileText
                                className={`w-5 h-5 flex-shrink-0 ${isPending ? "text-orange-400 animate-pulse" : "text-emerald-400"}`}
                                data-testid={`icon-report-${item.type}-${item.id}`}
                              />
                              <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.label}`}>
                                  {item.subject}
                                </span>
                                {isPending ? (
                                  <span className="flex items-center gap-1 text-[10px] text-amber-400" data-testid={`status-pending-${item.id}`}>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    AI Analyzing...
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[10px] text-emerald-400" data-testid={`status-completed-${item.id}`}>
                                    <CheckCircle2 className="w-3 h-3" />
                                    Graded
                                  </span>
                                )}
                              </div>
                              <h3 className="text-sm font-medium text-slate-200 truncate" data-testid={`text-completed-title-${item.type}-${item.id}`}>
                                {item.title}
                              </h3>
                              <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                                <span>{format(new Date(item.date), "MMM d, yyyy")}</span>
                              </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div
                                className="text-2xl font-bold"
                                style={{ color: pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e", textShadow: `0 0 12px ${pct >= 70 ? "#10b98130" : pct >= 50 ? "#f59e0b30" : "#f43f5e30"}` }}
                                data-testid={`text-score-${item.type}-${item.id}`}
                              >
                                {pct}%
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.score}/{item.maxScore}
                              </div>
                              {item.feedbackHtml && !isPending && (
                                <button
                                  onClick={() => {
                                    const w = window.open("", "_blank");
                                    if (w) {
                                      w.document.write(`
                                        <html><head><title>${item.title} - Report</title>
                                        <style>body{font-family:system-ui;padding:40px;max-width:800px;margin:0 auto;background:#0b0f1a;color:#e2e8f0}h3{color:#a78bfa}ul{padding-left:20px}li{margin-bottom:8px}hr{border-color:#1e293b}</style>
                                        </head><body>${item.feedbackHtml}</body></html>
                                      `);
                                      w.document.close();
                                    }
                                  }}
                                  className="text-[10px] text-violet-400 hover:text-violet-300 mt-1 block transition-colors"
                                  data-testid={`button-view-report-${item.type}-${item.id}`}
                                >
                                  View Report →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {completedItems.length > 5 && (
                    <button
                      onClick={() => setShowAllCompleted(!showAllCompleted)}
                      className="w-full text-center text-xs text-violet-400 hover:text-violet-300 transition-colors py-2 mt-1"
                      data-testid="button-toggle-completed"
                    >
                      {showAllCompleted ? "Show Less" : `Show More (${completedItems.length - 5} more)`}
                    </button>
                  )}
                </div>
              </section>
            </div>

            <section className="flex justify-center pt-2 pb-6">
              <button
                className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-semibold text-sm text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 ring-2 ring-emerald-500/20 hover:bg-emerald-500/10 hover:ring-emerald-500/40 hover:border-emerald-500/40 transition-all duration-300 shadow-[0_0_30px_rgba(16,185,129,0.08)] hover:shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                data-testid="button-consult-ai-tutor"
                onClick={() => setLocation("/soma/chat")}
              >
                <Sparkles className="w-4.5 h-4.5 text-emerald-400 group-hover:animate-pulse" />
                Consult Global AI Tutor
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
