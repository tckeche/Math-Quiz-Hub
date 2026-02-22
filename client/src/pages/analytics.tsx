import { useRef, useState } from "react";
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
    contentRef: reportRef,
    documentTitle: `${quiz?.title || "class"}-analytics-report`,
  });

  if (sessionLoading) return <div className="p-6">Loading...</div>;

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
      </div>
    </div>
  );
}
