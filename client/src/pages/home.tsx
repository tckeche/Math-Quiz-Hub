import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Quiz } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Calendar, ArrowRight, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function Home() {
  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const now = new Date();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-12 w-auto object-contain" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight gradient-text" data-testid="text-site-title">
                  Mathematics Assessment Portal
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">Select an examination to begin</p>
              </div>
            </div>
            <Link href="/admin">
              <Button variant="outline" size="sm" className="glow-button-outline text-sm" data-testid="link-admin">
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Admin
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-card p-6">
                <Skeleton className="h-6 w-3/4 mb-4 bg-white/10" />
                <Skeleton className="h-4 w-1/2 mb-2 bg-white/10" />
                <Skeleton className="h-4 w-1/3 bg-white/10" />
              </div>
            ))}
          </div>
        ) : !quizzes || quizzes.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <h2 className="text-xl font-semibold text-slate-400 mb-2">No Examinations Available</h2>
            <p className="text-sm text-slate-500">Check back later for upcoming assessments.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {quizzes.map((quiz) => {
              const isClosed = new Date(quiz.dueDate) < now;
              return (
                <div
                  key={quiz.id}
                  className={`glass-card p-6 transition-all duration-300 ${
                    isClosed ? "opacity-50" : "hover:border-violet-500/30 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <h3 className="font-semibold text-lg text-slate-100 leading-snug" data-testid={`text-quiz-title-${quiz.id}`}>
                      {quiz.title}
                    </h3>
                    <Badge
                      className={isClosed
                        ? "bg-slate-700/50 text-slate-400 border-slate-600"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      }
                      data-testid={`badge-quiz-status-${quiz.id}`}
                    >
                      {isClosed ? "Closed" : "Open"}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-slate-400 mb-5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-violet-400" />
                      <span>{quiz.timeLimitMinutes} minutes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-violet-400" />
                      <span>Due: {format(new Date(quiz.dueDate), "PPP 'at' p")}</span>
                    </div>
                  </div>
                  {!isClosed && (
                    <Link href={`/quiz/${quiz.id}`}>
                      <Button className="w-full glow-button" size="lg" data-testid={`button-start-quiz-${quiz.id}`}>
                        Start Examination
                        <ArrowRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
