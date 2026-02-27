import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { getSubjectColor, getSubjectIcon } from "@/lib/subjectColors";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import type { SomaQuiz } from "@shared/schema";
import {
  LogOut, Users, BookOpen, Plus, UserPlus, X,
  Loader2, Check, LayoutDashboard, TrendingUp,
  Award, Sparkles, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Session } from "@supabase/supabase-js";

const CARD_CLASS = "bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl";
const SECTION_LABEL = "text-slate-400 text-xs font-semibold tracking-wider uppercase";

interface DashboardStats {
  totalStudents: number;
  totalQuizzes: number;
  cohortAverages: { subject: string; average: number; count: number }[];
  recentSubmissions: { studentName: string; score: number; quizTitle: string; subject: string | null; createdAt: string }[];
}

function DonutCard({ subject, percentage, color }: { subject: string; percentage: number; color: string }) {
  const data = [
    { value: percentage },
    { value: 100 - percentage },
  ];
  const SubIcon = getSubjectIcon(subject);
  return (
    <div
      className={CARD_CLASS}
      style={{
        background: `linear-gradient(145deg, rgba(15,23,42,0.9), rgba(30,41,59,0.7))`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px ${color}10`,
      }}
      data-testid={`card-donut-${subject}`}
    >
      <div className="flex flex-col items-center">
        <div
          className="w-28 h-28 relative"
          style={{
            filter: `drop-shadow(0 4px 12px ${color}30)`,
            transform: "perspective(400px) rotateX(5deg)",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id={`grad-tutor-${subject}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={1} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={48}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
                cornerRadius={4}
              >
                <Cell fill={`url(#grad-tutor-${subject})`} />
                <Cell fill="rgba(255,255,255,0.04)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-lg font-bold text-white"
              style={{ textShadow: `0 0 20px ${color}60, 0 2px 4px rgba(0,0,0,0.5)` }}
              data-testid={`text-donut-value-${subject}`}
            >
              {Math.round(percentage)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <SubIcon className="w-3.5 h-3.5" style={{ color }} />
          <p className={`${SECTION_LABEL}`} style={{ color }}>{subject}</p>
        </div>
      </div>
    </div>
  );
}

export default function TutorDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split("@")[0] || "Tutor";
  const headers = useMemo(() => ({ "x-tutor-id": userId || "" }), [userId]);
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/tutor/dashboard-stats", userId],
    queryFn: async () => {
      const res = await fetch("/api/tutor/dashboard-stats", { headers });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    enabled: !!userId,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/login");
  };

  const overallAvg = useMemo(() => {
    if (!stats?.cohortAverages?.length) return null;
    const total = stats.cohortAverages.reduce((s, c) => s + c.average * c.count, 0);
    const count = stats.cohortAverages.reduce((s, c) => s + c.count, 0);
    return count > 0 ? Math.round(total / count) : null;
  }, [stats]);

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
          <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-violet-300 border-b-2 border-violet-500 cursor-default" data-testid="nav-dashboard">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </span>
          <Link href="/tutor/students">
            <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent transition-all cursor-pointer" data-testid="nav-students">
              <Users className="w-4 h-4" />
              Students
            </span>
          </Link>
          <Link href="/tutor/assessments">
            <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent transition-all cursor-pointer" data-testid="nav-assessments">
              <BookOpen className="w-4 h-4" />
              Assessments
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Students" value={stats?.totalStudents ?? 0} color="#8B5CF6" />
              <StatCard icon={BookOpen} label="Assessments" value={stats?.totalQuizzes ?? 0} color="#10B981" />
              <StatCard icon={TrendingUp} label="Submissions" value={stats?.recentSubmissions?.length ?? 0} color="#F59E0B" />
              <StatCard icon={Award} label="Cohort Avg" value={overallAvg !== null ? `${overallAvg}%` : "—"} color="#3B82F6" />
            </div>

            {(stats?.cohortAverages?.length ?? 0) > 0 && (
              <section>
                <h3 className={`${SECTION_LABEL} mb-4`}>Cohort Performance by Subject</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {stats!.cohortAverages.map((ca) => {
                    const sc = getSubjectColor(ca.subject);
                    return <DonutCard key={ca.subject} subject={ca.subject} percentage={ca.average} color={sc.hex} />;
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className={SECTION_LABEL}>Recent Submissions</h3>
                <Link href="/tutor/students">
                  <span className="text-xs text-violet-400 hover:text-violet-300 cursor-pointer flex items-center gap-1" data-testid="link-view-all-students">
                    View All Students <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>

              {(stats?.recentSubmissions?.length ?? 0) === 0 ? (
                <div className={`${CARD_CLASS} text-center py-10`}>
                  <Sparkles className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                  <p className="text-sm text-slate-400">No submissions yet</p>
                  <p className="text-xs text-slate-500 mt-1">Student assessment results will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats!.recentSubmissions.map((sub, idx) => {
                    const sc = getSubjectColor(sub.subject);
                    const SubIcon = getSubjectIcon(sub.subject);
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl px-5 py-3.5"
                        data-testid={`submission-${idx}`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${sc.border}`} style={{ backgroundColor: `${sc.hex}15` }}>
                          <SubIcon className="w-4 h-4" style={{ color: sc.hex }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200">
                            <span className="font-medium">{sub.studentName}</span>
                            <span className="text-slate-500"> completed </span>
                            <span className="text-slate-300">{sub.quizTitle}</span>
                          </p>
                          <p className="text-[10px] text-slate-500">{format(new Date(sub.createdAt), "PPp")}</p>
                        </div>
                        <Badge
                          className={`text-xs font-bold px-2.5 py-1 border ${
                            sub.score >= 70
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : sub.score >= 40
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          }`}
                          data-testid={`score-${idx}`}
                        >
                          {sub.score}%
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div
      className={CARD_CLASS}
      style={{ borderColor: `${color}20` }}
      data-testid={`stat-${label.toLowerCase()}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-100">{value}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
        </div>
      </div>
    </div>
  );
}
