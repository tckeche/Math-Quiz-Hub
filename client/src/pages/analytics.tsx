<<<<<<< HEAD
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import DOMPurify from "dompurify";
import { useReactToPrint } from "react-to-print";
import type { Quiz, Submission, Student } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const quizId = Number(params.id || 0);
  const reportRef = useRef<HTMLDivElement>(null);
  const [analysis, setAnalysis] = useState<string>("");

  const authenticated = typeof window !== "undefined" && localStorage.getItem("admin_token") === "authenticated";

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

  if (!authenticated) return <div className="p-6">Please log in via /admin first.</div>;

  return (
    <div className="min-h-screen p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Class Analytics: {quiz?.title || "..."}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Submissions: {submissions?.length ?? 0}</p>
          <div className="flex gap-2">
            <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>{analyzeMutation.isPending ? "Analyzing..." : "Generate Class AI Analysis"}</Button>
            <Button variant="outline" onClick={handlePrint} disabled={!analysis}>Download Report as PDF</Button>
          </div>
        </CardContent>
      </Card>
      <div ref={reportRef} className="bg-white text-black p-6 rounded border min-h-[200px]">
        {!analysis ? <p>No report generated yet.</p> : <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(analysis) }} />}
=======
import { useState, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Quiz, Question, Submission, Student } from "@shared/schema";
import DOMPurify from "dompurify";
import { useReactToPrint } from "react-to-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Brain, Loader2, Download, Users, BarChart3 } from "lucide-react";

type SubmissionWithStudent = Submission & { student: Student };

export default function AnalyticsPage() {
  const params = useParams<{ quizId: string }>();
  const quizId = Number(params.quizId);
  const { toast } = useToast();
  const contentRef = useRef<HTMLDivElement>(null);

  const [classAnalysis, setClassAnalysis] = useState<string | null>(null);
  const [classLoading, setClassLoading] = useState(false);
  const [studentAnalyses, setStudentAnalyses] = useState<Record<number, string>>({});
  const [studentLoading, setStudentLoading] = useState<Record<number, boolean>>({});

  const isAuthenticated = localStorage.getItem("admin_token") === "authenticated";

  const { data: quiz, isLoading: quizLoading } = useQuery<Quiz>({
    queryKey: ["/api/admin/quizzes", quizId],
    enabled: isAuthenticated,
  });

  const { data: submissions, isLoading: submissionsLoading } = useQuery<SubmissionWithStudent[]>({
    queryKey: ["/api/admin/quizzes", quizId, "submissions"],
    enabled: isAuthenticated,
  });

  const { data: questions, isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/admin/quizzes", quizId, "questions"],
    enabled: isAuthenticated,
  });

  const handlePrint = useReactToPrint({ contentRef });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10">
            <p className="text-muted-foreground mb-4" data-testid="text-auth-redirect">
              You must be logged in as an admin to view analytics.
            </p>
            <Link href="/admin">
              <Button data-testid="link-admin-login">Go to Admin Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = quizLoading || submissionsLoading || questionsLoading;

  const totalSubmissions = submissions?.length ?? 0;
  const scores = submissions?.map((s) => (s.maxPossibleScore > 0 ? (s.totalScore / s.maxPossibleScore) * 100 : 0)) ?? [];
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

  const handleClassAnalysis = async () => {
    setClassLoading(true);
    try {
      const res = await apiRequest("POST", "/api/analyze-class", { quizId });
      const data = await res.json();
      setClassAnalysis(data.analysis);
    } catch (err: any) {
      toast({ title: "Class analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setClassLoading(false);
    }
  };

  const handleStudentAnalysis = async (submission: SubmissionWithStudent) => {
    setStudentLoading((prev) => ({ ...prev, [submission.id]: true }));
    try {
      const res = await apiRequest("POST", "/api/analyze-student", { submission, questions });
      const data = await res.json();
      setStudentAnalyses((prev) => ({ ...prev, [submission.id]: data.analysis }));
    } catch (err: any) {
      toast({ title: "Student analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setStudentLoading((prev) => ({ ...prev, [submission.id]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/admin">
              <Button variant="outline" size="icon" data-testid="link-back-admin">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="font-serif text-2xl font-bold" data-testid="text-analytics-title">
                {quiz?.title ?? "Quiz"} — Analytics
              </h1>
              {quiz?.pinCode && (
                <p className="text-sm text-muted-foreground">
                  PIN: <Badge variant="secondary">{quiz.pinCode}</Badge>
                </p>
              )}
            </div>
          </div>
          <Button onClick={() => handlePrint()} data-testid="button-download-pdf">
            <Download className="w-4 h-4 mr-1.5" />
            Download Report as PDF
          </Button>
        </div>

        <div ref={contentRef}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="stat-total-submissions">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Users className="w-4 h-4" />
                  Total Submissions
                </div>
                <p className="text-2xl font-bold font-serif">{totalSubmissions}</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-average-score">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <BarChart3 className="w-4 h-4" />
                  Average Score
                </div>
                <p className="text-2xl font-bold font-serif">{avgScore.toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-highest-score">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <BarChart3 className="w-4 h-4" />
                  Highest Score
                </div>
                <p className="text-2xl font-bold font-serif">{highestScore.toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-lowest-score">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <BarChart3 className="w-4 h-4" />
                  Lowest Score
                </div>
                <p className="text-2xl font-bold font-serif">{lowestScore.toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>

          <Separator className="my-6" />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Class-Wide Analysis
                </CardTitle>
                {!classAnalysis && (
                  <Button
                    onClick={handleClassAnalysis}
                    disabled={classLoading}
                    data-testid="button-generate-class-analysis"
                  >
                    {classLoading ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Brain className="w-4 h-4 mr-1.5" />
                    )}
                    {classLoading ? "Generating..." : "Generate Class Analysis"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {classLoading && (
                <div className="flex flex-col items-center py-10" data-testid="loader-class-analysis">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Analyzing class performance...</p>
                </div>
              )}
              {classAnalysis && (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(classAnalysis) }}
                  data-testid="text-class-analysis"
                />
              )}
              {!classLoading && !classAnalysis && (
                <p className="text-sm text-muted-foreground">
                  Click the button above to generate an AI-powered analysis of all submissions.
                </p>
              )}
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <div className="space-y-4">
            <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Individual Student Results
            </h2>
            {submissions && submissions.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-no-submissions">
                No submissions yet.
              </p>
            )}
            {submissions?.map((sub) => {
              const pct = sub.maxPossibleScore > 0 ? ((sub.totalScore / sub.maxPossibleScore) * 100).toFixed(1) : "0.0";
              return (
                <Card key={sub.id} data-testid={`card-submission-${sub.id}`}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-medium" data-testid={`text-student-name-${sub.id}`}>
                          {sub.student.firstName} {sub.student.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-student-score-${sub.id}`}>
                          Score: {sub.totalScore}/{sub.maxPossibleScore} ({pct}%)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={Number(pct) >= 50 ? "default" : "destructive"}>
                          {pct}%
                        </Badge>
                        {!studentAnalyses[sub.id] && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStudentAnalysis(sub)}
                            disabled={studentLoading[sub.id]}
                            data-testid={`button-analyze-student-${sub.id}`}
                          >
                            {studentLoading[sub.id] ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Brain className="w-4 h-4 mr-1" />
                            )}
                            {studentLoading[sub.id] ? "Analyzing..." : "Analyze with AI"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {studentLoading[sub.id] && (
                      <div className="flex items-center gap-2 py-4 justify-center" data-testid={`loader-student-${sub.id}`}>
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Analyzing student performance...</span>
                      </div>
                    )}
                    {studentAnalyses[sub.id] && (
                      <div className="border rounded-md p-4 bg-muted/30">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Brain className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-medium">AI Analysis</h4>
                        </div>
                        <div
                          className="prose prose-sm max-w-none text-sm"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(studentAnalyses[sub.id]) }}
                          data-testid={`text-student-analysis-${sub.id}`}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
>>>>>>> e68bba0 (Add quiz PIN verification and AI-powered quiz builder features)
      </div>
    </div>
  );
}
