import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Quiz, Question, Submission, Student } from "@shared/schema";
import DOMPurify from "dompurify";
import { useReactToPrint } from "react-to-print";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, Plus, Upload, FileJson, Eye, Download, ArrowLeft, Trash2,
  BookOpen, Clock, Calendar, Users, CheckCircle2, AlertCircle, LogOut,
  FileText, Loader2, Pencil, ImagePlus, Save, Brain, X
} from "lucide-react";
import { format } from "date-fns";

interface GeneratedQuestion {
  prompt_text: string;
  options: string[];
  correct_answer: string;
  marks_worth: number;
  image_url?: string | null;
}

function normalizeJsonPayload(text: string) {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray((parsed as { questions?: unknown }).questions)) {
    return (parsed as { questions: unknown[] }).questions;
  }
  return [parsed];
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/login", { password });
      setError("");
      onLogin();
    } catch (err: any) {
      setError(err?.message || "Incorrect password. Access denied.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="font-serif text-xl">Admin Access</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Enter the administrator password to continue.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Enter admin password"
                data-testid="input-admin-password"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-admin-error">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" data-testid="button-admin-login" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateQuizForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState("60");
  const [dueDate, setDueDate] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; timeLimitMinutes: number; dueDate: string }) =>
      apiRequest("POST", "/api/admin/quizzes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });
      toast({ title: "Quiz created successfully" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create quiz", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    createMutation.mutate({ title: title.trim(), timeLimitMinutes: parseInt(timeLimit), dueDate });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">Create New Quiz</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pure Mathematics Paper 1" data-testid="input-quiz-title" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
              <Input id="timeLimit" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} data-testid="input-quiz-time" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input id="dueDate" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="input-quiz-due" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-quiz">Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-quiz">
              {createMutation.isPending ? "Creating..." : "Create Quiz"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function QuestionUploader({ quizId, onDone }: { quizId: number; onDone: () => void }) {
  const { toast } = useToast();
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState("");

  const uploadMutation = useMutation({
    mutationFn: async (questions: any[]) =>
      apiRequest("POST", `/api/admin/quizzes/${quizId}/questions`, { questions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", quizId, "questions"] });
      toast({ title: "Questions uploaded successfully" });
      setJsonText("");
      setParseError("");
      onDone();
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const parseAndUpload = useCallback((text: string) => {
    setParseError("");
    try {
      const questions = normalizeJsonPayload(text);
      uploadMutation.mutate(questions);
    } catch (err: any) {
      setParseError(`Invalid JSON: ${err.message}`);
    }
  }, [uploadMutation]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonText(text);
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonText.trim()) return;
    parseAndUpload(jsonText);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Questions (JSON)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jsonFile">Upload .json file</Label>
            <Input id="jsonFile" type="file" accept=".json" onChange={handleFileUpload} data-testid="input-question-file" />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="jsonText">Or paste raw JSON</Label>
            <Textarea
              id="jsonText"
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setParseError(""); }}
              placeholder={`[\n  {\n    "prompt_text": "Solve \\\\(x^2 + 3x + 2 = 0\\\\)",\n    "options": ["x = -1, -2", "x = 1, 2", "x = -1, 2", "x = 1, -2"],\n    "correct_answer": "x = -1, -2",\n    "marks_worth": 3,\n    "image_url": null\n  }\n]`}
              className="min-h-[200px] font-mono text-sm"
              data-testid="input-question-json"
            />
          </div>
          {parseError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive flex items-start gap-2" data-testid="text-json-error">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {parseError}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onDone} data-testid="button-cancel-upload">Cancel</Button>
            <Button type="submit" disabled={uploadMutation.isPending} data-testid="button-upload-questions">
              <FileJson className="w-4 h-4 mr-1.5" />
              {uploadMutation.isPending ? "Uploading..." : "Upload Questions"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PdfQuizGenerator({ quizId, onDone }: { quizId: number; onDone: () => void }) {
  const { toast } = useToast();
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("pdf", file);
      const res = await fetch("/api/generate-questions", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Generation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedQuestions(data.questions);
      toast({ title: `${data.questions.length} questions extracted from PDF` });
    },
    onError: (err: Error) => {
      toast({ title: "PDF analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (questions: GeneratedQuestion[]) =>
      apiRequest("POST", `/api/admin/quizzes/${quizId}/questions`, { questions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", quizId, "questions"] });
      toast({ title: "Questions saved to quiz" });
      setGeneratedQuestions(null);
      onDone();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save questions", description: err.message, variant: "destructive" });
    },
  });

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    generateMutation.mutate(file);
  };

  const updateQuestion = (index: number, field: keyof GeneratedQuestion, value: any) => {
    if (!generatedQuestions) return;
    const updated = [...generatedQuestions];
    updated[index] = { ...updated[index], [field]: value };
    setGeneratedQuestions(updated);
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    if (!generatedQuestions) return;
    const updated = [...generatedQuestions];
    const newOptions = [...updated[qIndex].options];
    newOptions[optIndex] = value;
    updated[qIndex] = { ...updated[qIndex], options: newOptions };
    setGeneratedQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    if (!generatedQuestions) return;
    setGeneratedQuestions(generatedQuestions.filter((_, i) => i !== index));
  };

  const handleImageUpload = async (qIndex: number, file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/upload-image", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      updateQuestion(qIndex, "image_url", data.url);
      toast({ title: "Image attached" });
    } catch {
      toast({ title: "Image upload failed", variant: "destructive" });
    }
  };

  const handlePublish = () => {
    if (!generatedQuestions || generatedQuestions.length === 0) return;
    saveMutation.mutate(generatedQuestions);
  };

  if (generateMutation.isPending) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
          <h3 className="font-serif text-lg font-semibold mb-2" data-testid="text-pdf-analyzing">Analyzing PDF...</h3>
          <p className="text-sm text-muted-foreground">
            Extracting questions and solving for correct answers. This may take 10-20 seconds.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (generatedQuestions) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="font-serif text-lg flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Review & Edit ({generatedQuestions.length} questions)
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setGeneratedQuestions(null); }} data-testid="button-discard-generated">
                Discard
              </Button>
              <Button size="sm" onClick={handlePublish} disabled={saveMutation.isPending || generatedQuestions.length === 0} data-testid="button-publish-generated">
                <Save className="w-4 h-4 mr-1" />
                {saveMutation.isPending ? "Saving..." : "Save & Publish Quiz"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {generatedQuestions.map((q, idx) => (
              <div key={idx} className="border rounded-md p-4 space-y-3" data-testid={`card-generated-q-${idx}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm text-muted-foreground font-medium shrink-0">Q{idx + 1}</span>
                  <Button variant="outline" size="icon" onClick={() => removeQuestion(idx)} data-testid={`button-remove-generated-${idx}`}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Question Text (LaTeX)</Label>
                  <Textarea
                    value={q.prompt_text}
                    onChange={(e) => updateQuestion(idx, "prompt_text", e.target.value)}
                    className="font-mono text-sm min-h-[60px]"
                    data-testid={`input-generated-prompt-${idx}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Image URL (optional)</Label>
                  <Input
                    value={q.image_url ?? ""}
                    onChange={(e) => updateQuestion(idx, "image_url", e.target.value || null)}
                    placeholder="https://example.com/diagram.png"
                    className="font-mono text-sm"
                    data-testid={`input-generated-image-url-${idx}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Option {String.fromCharCode(65 + optIdx)}</Label>
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                        className="font-mono text-sm"
                        data-testid={`input-generated-opt-${idx}-${optIdx}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Correct Answer</Label>
                    <Input
                      value={q.correct_answer}
                      onChange={(e) => updateQuestion(idx, "correct_answer", e.target.value)}
                      className="font-mono text-sm"
                      data-testid={`input-generated-answer-${idx}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Marks</Label>
                    <Input
                      type="number"
                      min="1"
                      value={q.marks_worth}
                      onChange={(e) => updateQuestion(idx, "marks_worth", parseInt(e.target.value) || 1)}
                      className="font-mono text-sm"
                      data-testid={`input-generated-marks-${idx}`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label htmlFor={`img-upload-${idx}`} className="cursor-pointer">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground border rounded-md px-3 py-1.5">
                      <ImagePlus className="w-4 h-4" />
                      {q.image_url ? "Change Image" : "Attach Image"}
                    </div>
                    <input
                      id={`img-upload-${idx}`}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(idx, e.target.files[0]); }}
                      data-testid={`input-generated-image-${idx}`}
                    />
                  </Label>
                  {q.image_url && (
                    <div className="flex items-center gap-2">
                      <img src={q.image_url} alt="attached" className="h-10 w-10 object-cover rounded border" />
                      <Button variant="outline" size="sm" onClick={() => updateQuestion(idx, "image_url", null)}>Remove</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Generate Questions from PDF
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a math exam PDF and AI will extract multiple-choice questions with LaTeX notation.
            You'll be able to review and edit before publishing.
          </p>
          <div className="space-y-2">
            <Label htmlFor="pdfFile">Select PDF file</Label>
            <Input id="pdfFile" type="file" accept=".pdf" onChange={handlePdfUpload} data-testid="input-pdf-upload" />
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onDone} data-testid="button-cancel-pdf">Cancel</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentAnalysis({ submission, questions }: { submission: Submission & { student: Student }; questions: Question[] }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `student-analysis-${submission.id}`,
  });

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/analyze-student", { submission, questions });
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!analysis && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnalyze}
          disabled={loading}
          data-testid={`button-analyze-${submission.id}`}
        >
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
          {loading ? "Analyzing..." : "Analyze with AI"}
        </Button>
      )}
      {analysis && (
        <div className="mt-3 border rounded-md p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-primary" />
              AI Analysis
            </h4>
            <Button variant="outline" size="sm" onClick={() => setAnalysis(null)}>Close</Button>
          </div>
          <div className="mb-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>Download Report as PDF</Button>
          </div>
          <div
            ref={printRef}
            className="prose prose-sm max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(analysis) }}
            data-testid={`text-analysis-${submission.id}`}
          />
        </div>
      )}
    </div>
  );
}

function QuizDetail({ quizId, onBack, onDeleted }: { quizId: number; onBack: () => void; onDeleted: () => void }) {
  const [showUploader, setShowUploader] = useState(false);
  const [showPdfGen, setShowPdfGen] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const { data: quiz, isLoading: quizLoading } = useQuery<Quiz>({
    queryKey: ["/api/admin/quizzes", quizId],
  });

  const { data: questions, isLoading: questionsLoading } = useQuery<Question[]>({
    queryKey: ["/api/admin/quizzes", quizId, "questions"],
  });

  const { data: submissions } = useQuery<(Submission & { student: Student })[]>({
    queryKey: ["/api/admin/quizzes", quizId, "submissions"],
  });

  const { toast } = useToast();

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) =>
      apiRequest("DELETE", `/api/admin/questions/${questionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", quizId, "questions"] });
      toast({ title: "Question deleted" });
    },
  });

  const deleteQuizMutation = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/admin/quizzes/${quizId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });
      toast({ title: "Exam deleted", description: "Quiz, questions, and submissions were removed." });
      onDeleted();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete exam", description: err.message, variant: "destructive" });
    },
  });

  const deleteSubmissionMutation = useMutation({
    mutationFn: async (submissionId: number) =>
      apiRequest("DELETE", `/api/admin/submissions/${submissionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", quizId, "submissions"] });
      toast({ title: "Submission deleted" });
    },
  });

  const clearSubmissionsMutation = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/admin/quizzes/${quizId}/submissions`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", quizId, "submissions"] });
      toast({ title: "All submissions deleted" });
    },
  });

  const downloadCSV = () => {
    if (!submissions || !quiz) return;
    const headers = ["Student Name", "Total Score", "Max Score", "Percentage", "Submitted At"];
    const rows = submissions.map((s) => [
      `${s.student.firstName} ${s.student.lastName}`,
      s.totalScore.toString(),
      s.maxPossibleScore.toString(),
      ((s.totalScore / s.maxPossibleScore) * 100).toFixed(1) + "%",
      format(new Date(s.submittedAt), "PPP p"),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${quiz.title.replace(/\s+/g, "_")}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (quizLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!quiz) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onBack} data-testid="button-back-admin">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("Delete this entire exam? This will remove questions and all submitted tests.")) {
              deleteQuizMutation.mutate();
            }
          }}
          disabled={deleteQuizMutation.isPending}
          data-testid="button-delete-exam"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          {deleteQuizMutation.isPending ? "Deleting..." : "Delete Exam"}
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-xl font-bold truncate" data-testid="text-quiz-detail-title">{quiz.title}</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{quiz.timeLimitMinutes} min</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Due {format(new Date(quiz.dueDate), "PPP")}</span>
            <Badge variant="secondary">PIN: {quiz.pinCode}</Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => { setShowUploader(!showUploader); setShowPdfGen(false); }} data-testid="button-toggle-uploader">
          <Upload className="w-4 h-4 mr-1" />
          Add Questions (JSON)
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setShowPdfGen(!showPdfGen); setShowUploader(false); }} data-testid="button-toggle-pdf">
          <FileText className="w-4 h-4 mr-1" />
          Generate from PDF
        </Button>
        <Link href="/admin/builder">
          <Button variant="outline" size="sm">AI Builder</Button>
        </Link>
        <Link href={`/admin/analytics/${quizId}`}>
          <Button variant="outline" size="sm">Class Analytics</Button>
        </Link>
        <Button variant="outline" size="sm" onClick={() => setShowResults(!showResults)} data-testid="button-toggle-results">
          <Users className="w-4 h-4 mr-1" />
          View Results ({submissions?.length ?? 0})
        </Button>
        {submissions && submissions.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={downloadCSV} data-testid="button-download-csv">
              <Download className="w-4 h-4 mr-1" />
              Download CSV
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm("Delete all submitted tests for this quiz? This cannot be undone.")) {
                  clearSubmissionsMutation.mutate();
                }
              }}
              disabled={clearSubmissionsMutation.isPending}
              data-testid="button-delete-all-submissions"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {clearSubmissionsMutation.isPending ? "Deleting..." : "Delete All Tests"}
            </Button>
          </>
        )}
      </div>

      {showUploader && (
        <QuestionUploader quizId={quizId} onDone={() => setShowUploader(false)} />
      )}

      {showPdfGen && (
        <PdfQuizGenerator quizId={quizId} onDone={() => setShowPdfGen(false)} />
      )}

      {showResults && submissions && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No submissions yet.</p>
            ) : (
              <div className="space-y-4">
                {submissions.map((s) => (
                  <div key={s.id} className="border rounded-md p-4" data-testid={`row-submission-${s.id}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium">{s.student.firstName} {s.student.lastName}</p>
                        <p className="text-sm text-muted-foreground">{format(new Date(s.submittedAt), "PP p")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{s.totalScore}/{s.maxPossibleScore}</span>
                        <Badge variant={s.totalScore / s.maxPossibleScore >= 0.5 ? "default" : "secondary"}>
                          {((s.totalScore / s.maxPossibleScore) * 100).toFixed(0)}%
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm("Delete this submitted test?")) {
                              deleteSubmissionMutation.mutate(s.id);
                            }
                          }}
                          disabled={deleteSubmissionMutation.isPending}
                          data-testid={`button-delete-submission-${s.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete Test
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 rounded-md border bg-muted/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Marks Breakdown</p>
                      <div className="grid gap-1">
                        {Object.entries(s.answersBreakdown).map(([questionId, detail]) => (
                          <div key={questionId} className="text-sm flex items-center justify-between gap-2">
                            <span>Q{questionId}: {detail.answer || "No answer"}</span>
                            <span className={detail.correct ? "text-primary" : "text-muted-foreground"}>
                              {detail.correct ? `+${detail.marksEarned}` : "0"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <StudentAnalysis submission={s} questions={questions || []} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">
            Questions ({questionsLoading ? "..." : questions?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {questionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !questions || questions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileJson className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No questions added yet. Upload JSON or generate from a PDF.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="border rounded-md p-3 flex items-start gap-3" data-testid={`card-question-${q.id}`}>
                  <span className="text-sm font-mono text-muted-foreground font-medium mt-0.5 shrink-0 w-7">
                    Q{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{q.promptText}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary">{q.options.length} options</Badge>
                      <Badge variant="secondary">[{q.marksWorth}] marks</Badge>
                      {q.imageUrl && <Badge variant="secondary">Has image</Badge>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteQuestionMutation.mutate(q.id)}
                    data-testid={`button-delete-question-${q.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  const [authVersion, setAuthVersion] = useState(0);

  const { data: adminSession, isLoading: sessionLoading, error: sessionError } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/admin/session", authVersion],
    queryFn: async () => {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      return res.json();
    },
  });

  const authenticated = adminSession?.authenticated === true;

  const { data: quizzes, isLoading, error: quizzesError } = useQuery<Quiz[]>({
    queryKey: ["/api/admin/quizzes"],
    enabled: authenticated,
  });

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAuthVersion((v) => v + 1);
  };

  if (sessionLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (sessionError) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-destructive">Failed to verify admin session.</div>;
  }

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthVersion((v) => v + 1)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">Manage quizzes and view results</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-admin-logout">
            <LogOut className="w-4 h-4 mr-1" />
            Log Out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {selectedQuizId !== null ? (
          <QuizDetail quizId={selectedQuizId} onBack={() => setSelectedQuizId(null)} onDeleted={() => setSelectedQuizId(null)} />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-serif text-lg font-semibold">Quizzes</h2>
              <Button size="sm" onClick={() => setShowCreateForm(true)} data-testid="button-create-quiz">
                <Plus className="w-4 h-4 mr-1" />
                New Quiz
              </Button>
            </div>

            {showCreateForm && (
              <CreateQuizForm onClose={() => setShowCreateForm(false)} />
            )}

            {quizzesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-4">
                Failed to load quizzes. Please refresh and try again.
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : !quizzes || quizzes.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <h3 className="font-serif text-lg font-medium text-muted-foreground">No quizzes yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Create your first quiz to get started.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {quizzes.map((quiz) => {
                  const isClosed = new Date(quiz.dueDate) < new Date();
                  return (
                    <Card
                      key={quiz.id}
                      className="cursor-pointer transition-colors"
                      onClick={() => setSelectedQuizId(quiz.id)}
                      data-testid={`card-admin-quiz-${quiz.id}`}
                    >
                      <CardContent className="flex items-center justify-between gap-4 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-serif font-semibold truncate">{quiz.title}</h3>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <span>{quiz.timeLimitMinutes} min</span>
                              <span>Due {format(new Date(quiz.dueDate), "PP")}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={isClosed ? "secondary" : "default"}>
                            {isClosed ? "Closed" : "Open"}
                          </Badge>
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
