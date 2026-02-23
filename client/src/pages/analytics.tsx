import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import DOMPurify from "dompurify";
import { useReactToPrint } from "react-to-print";
import type { Quiz, Submission, Student } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft, BarChart3, Download, Loader2, Sparkles } from "lucide-react";

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const quizId = Number(params.id || 0);
  const reportRef = useRef<HTMLDivElement>(null);
  const [analysis, setAnalysis] = useState<string>("");

  const { data: adminSession, isLoading: sessionLoading, error: sessionError } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/admin/session"],
    queryFn: async () => {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      return res.json();
    },
  });

  const authenticated = adminSession?.authenticated === true;

  const { data: quiz } = useQuery<Quiz>({ queryKey: ["/api/admin/quizzes", quizId], enabled: authenticated && quizId > 0 });
  const { data: submissions } = useQuery<(Submission & { student: Student })[]>({
    queryKey: ["/api/admin/quizzes", quizId, "submissions"],
    enabled: authenticated && quizId > 0,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/analyze-class", { quizId });
      return res.json();
    },
    onSuccess: (data) => setAnalysis(data.analysis || ""),
  });

  const handlePrint = useReactToPrint({
    content: () => reportRef.current,
    documentTitle: `${quiz?.title || "class"}-analytics-report`,
  });

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-300">Please log in via <Link href="/admin"><a className="text-violet-400 underline">/admin</a></Link> first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/admin">
            <Button className="glow-button-outline" size="sm" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            <h1 className="text-lg font-bold gradient-text">Class Analytics: {quiz?.title || "..."}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{quiz?.title || "..."}</h2>
              <p className="text-sm text-slate-400 mt-1">Submissions: {submissions?.length ?? 0}</p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              className="glow-button"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              data-testid="button-generate-analysis"
            >
              {analyzeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Analyzing...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1.5" />Generate Class AI Analysis</>
              )}
            </Button>
            <Button className="glow-button-outline" onClick={handlePrint} disabled={!analysis} data-testid="button-download-report">
              <Download className="w-4 h-4 mr-1.5" />
              Download Report as PDF
            </Button>
          </div>
        </div>

        <div ref={reportRef} className="bg-white text-gray-900 p-8 rounded-2xl min-h-[200px] shadow-lg">
          {!analysis ? (
            <p className="text-gray-400 text-center py-8">No report generated yet. Click "Generate Class AI Analysis" to begin.</p>
          ) : (
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(analysis) }} />
          )}
        </div>
      </main>
    </div>
  );
}
