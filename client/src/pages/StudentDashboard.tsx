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
  Loader2, AlertTriangle, Filter, ChevronDown,
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

function DonutCard({ subject, percentage, color }: { subject: string; percentage: number; color: string }) {
  const data = [
    { value: percentage },
    { value: 100 - percentage },
  ];
  return (
    <div className="glass-card p-5 flex flex-col items-center" data-testid={`card-donut-${subject}`}>
      <div className="w-28 h-28 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={34}
              outerRadius={48}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="rgba(255,255,255,0.06)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-slate-100" data-testid={`text-donut-value-${subject}`}>
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3 font-medium tracking-wide uppercase">{subject}</p>
    </div>
  );
}

export default function StudentDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [, setLocation] = useLocation();
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

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
    <div className="min-h-screen">
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm sticky top-0 z-20">
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
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2"
                style={{ backgroundColor: "rgba(139,92,246,0.3)", boxShadow: `0 0 12px ${avatarRingColor}40`, border: `2px solid ${avatarRingColor}` }}
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
                <div key={i} className="glass-card p-5 flex flex-col items-center">
                  <Skeleton className="w-28 h-28 rounded-full bg-white/10" />
                  <Skeleton className="h-3 w-16 mt-3 bg-white/10" />
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="glass-card p-6">
                  <Skeleton className="h-5 w-40 mb-4 bg-white/10" />
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} className="h-20 w-full mb-3 bg-white/10 rounded-xl" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {subjectStats.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase mb-4" data-testid="text-section-performance">
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
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase" data-testid="text-section-available">
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
                      className="glass-input text-xs px-3 py-1.5 rounded-lg"
                      data-testid="select-subject-filter"
                    >
                      <option value="all">All Subjects</option>
                      {allSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {allLevels.length > 0 && (
                      <select
                        value={levelFilter}
                        onChange={(e) => setLevelFilter(e.target.value)}
                        className="glass-input text-xs px-3 py-1.5 rounded-lg"
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
                    <div className="glass-card p-8 text-center">
                      <BookOpen className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500">No available quizzes</p>
                    </div>
                  ) : (
                    filteredQuizzes.map((q) => {
                      const isOverdue = q.dueDate && new Date(q.dueDate) < now;
                      const sc = getSubjectColor(q.subject);
                      return (
                        <Link
                          key={`${q.type}-${q.id}`}
                          href={q.type === "soma" ? `/soma/quiz/${q.id}` : `/quiz/${q.id}`}
                        >
                          <div
                            className={`glass-card p-4 cursor-pointer transition-all duration-300 hover:border-violet-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] group ${sc.border}`}
                            data-testid={`card-available-quiz-${q.type}-${q.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.label}`}>
                                    {q.subject}
                                  </span>
                                  {q.level && (
                                    <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-full bg-white/5">
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
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-slate-400 tracking-widest uppercase mb-4" data-testid="text-section-completed">
                  Completed Quizzes
                </h2>
                <div className="space-y-3">
                  {completedItems.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500">No completed quizzes yet</p>
                    </div>
                  ) : (
                    completedItems.map((item) => {
                      const sc = getSubjectColor(item.subject);
                      const pct = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : 0;
                      const isPending = item.status === "pending";
                      return (
                        <div
                          key={`${item.type}-${item.id}`}
                          className={`glass-card p-4 transition-all duration-300 ${sc.border}`}
                          style={{ boxShadow: `0 0 15px ${getSubjectColor(item.subject).hex}08` }}
                          data-testid={`card-completed-${item.type}-${item.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
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
                            <div className="text-right flex-shrink-0">
                              <div className={`text-lg font-bold ${pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400"}`} data-testid={`text-score-${item.type}-${item.id}`}>
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
                                        <style>body{font-family:system-ui;padding:40px;max-width:800px;margin:0 auto;background:#0f172a;color:#e2e8f0}h3{color:#a78bfa}ul{padding-left:20px}li{margin-bottom:8px}hr{border-color:#334155}</style>
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
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
