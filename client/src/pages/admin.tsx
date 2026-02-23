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
  Plus, Upload, FileJson, Eye, Download, ArrowLeft, Trash2,
  BookOpen, Clock, Calendar, Users, CheckCircle2, AlertCircle, LogOut,
  FileText, Loader2, Pencil, ImagePlus, Save, Brain, X, BarChart3, MessageSquare,
  Scan, Search
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
      <div className="glass-card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-14 w-auto object-contain mx-auto mb-3" />
          <h2 className="text-xl font-bold gradient-text">Admin Access</h2>
          <p className="text-sm text-slate-400 mt-1">Enter the administrator password to continue.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Enter admin password"
              className="glass-input"
              data-testid="input-admin-password"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm" data-testid="text-admin-error">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <Button type="submit" className="w-full glow-button" size="lg" data-testid="button-admin-login" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
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
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Create New Quiz</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-slate-300">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pure Mathematics Paper 1" className="glass-input" data-testid="input-quiz-title" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="timeLimit" className="text-slate-300">Time Limit (minutes)</Label>
            <Input id="timeLimit" type="number" min="1" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} className="glass-input" data-testid="input-quiz-time" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate" className="text-slate-300">Due Date</Label>
            <Input id="dueDate" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="glass-input" data-testid="input-quiz-due" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" className="glow-button-outline" onClick={onClose} data-testid="button-cancel-quiz">Cancel</Button>
          <Button type="submit" className="glow-button" disabled={createMutation.isPending} data-testid="button-save-quiz">
            {createMutation.isPending ? "Creating..." : "Create Quiz"}
          </Button>
        </div>
      </form>
    </div>
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
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-4">
        <Upload className="w-5 h-5 text-violet-400" />
        Upload Questions (JSON)
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jsonFile" className="text-slate-300">Upload .json file</Label>
          <Input id="jsonFile" type="file" accept=".json" onChange={handleFileUpload} className="glass-input" data-testid="input-question-file" />
        </div>
        <Separator className="bg-white/5" />
        <div className="space-y-2">
          <Label htmlFor="jsonText" className="text-slate-300">Or paste raw JSON</Label>
          <Textarea
            id="jsonText"
            value={jsonText}
            onChange={(e) => { setJsonText(e.target.value); setParseError(""); }}
            placeholder={`[\n  {\n    "prompt_text": "Solve \\\\(x^2 + 3x + 2 = 0\\\\)",\n    "options": ["x = -1, -2", "x = 1, 2", "x = -1, 2", "x = 1, -2"],\n    "correct_answer": "x = -1, -2",\n    "marks_worth": 3,\n    "image_url": null\n  }\n]`}
            className="glass-input min-h-[200px] font-mono text-sm"
            data-testid="input-question-json"
          />
        </div>
        {parseError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300 flex items-start gap-2" data-testid="text-json-error">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {parseError}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button type="button" className="glow-button-outline" onClick={onDone} data-testid="button-cancel-upload">Cancel</Button>
          <Button type="submit" className="glow-button" disabled={uploadMutation.isPending} data-testid="button-upload-questions">
            <FileJson className="w-4 h-4 mr-1.5" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Questions"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const PIPELINE_STAGES = [
  { stage: 1, icon: "scan", label: "Gemini is reading the PDF...", aiName: "Google Gemini" },
  { stage: 2, icon: "brain", label: "DeepSeek is solving the mathematics...", aiName: "DeepSeek R1" },
  { stage: 3, icon: "pencil", label: "Claude is formatting the LaTeX...", aiName: "Claude Sonnet" },
  { stage: 4, icon: "search", label: "ChatGPT is validating the database schema...", aiName: "GPT-4o" },
];

function PdfQuizGenerator({ quizId, onDone }: { quizId: number; onDone: () => void }) {
  const { toast } = useToast();
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());
  const [stageLabel, setStageLabel] = useState("");

  const startPipeline = async (file: File) => {
    setPipelineActive(true);
    setCurrentStage(0);
    setCompletedStages(new Set());
    setStageLabel("");

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch("/api/generate-questions", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok || !res.body) {
        throw new Error("Server connection failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pendingEventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            pendingEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && pendingEventType) {
            const evType = pendingEventType;
            pendingEventType = "";
            try {
              const data = JSON.parse(line.slice(6));
              if (evType === "stage") {
                setCurrentStage(data.stage);
                setStageLabel(data.label);
              } else if (evType === "stage_done") {
                setCompletedStages(prev => { const next = new Set(Array.from(prev)); next.add(data.stage); return next; });
              } else if (evType === "result") {
                setGeneratedQuestions(data.questions);
                toast({ title: `${data.questions.length} questions extracted via AI pipeline` });
              } else if (evType === "error") {
                throw new Error(data.message);
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            }
          } else if (line.startsWith(":") || line.trim() === "") {
            // heartbeat or empty line - ignore
          }
        }
      }
    } catch (err: any) {
      toast({ title: "AI pipeline failed", description: err.message, variant: "destructive" });
    } finally {
      setPipelineActive(false);
    }
  };

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
    startPipeline(file);
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

  if (pipelineActive) {
    return (
      <div className="glass-card p-10" data-testid="pipeline-progress">
        <div className="max-w-md mx-auto space-y-4">
          <div className="text-center mb-6">
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-violet-400 mb-3" />
            <h3 className="text-lg font-semibold gradient-text" data-testid="text-pdf-analyzing">AI Pipeline Active</h3>
            <p className="text-sm text-slate-400 mt-1">4 specialized AIs are working in sequence. This may take 45-90 seconds.</p>
          </div>
          {PIPELINE_STAGES.map((s) => {
            const isDone = completedStages.has(s.stage);
            const isActive = currentStage === s.stage && !isDone;
            return (
              <div
                key={s.stage}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isDone ? "bg-emerald-500/10 border-emerald-500/30" :
                  isActive ? "bg-violet-500/10 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]" :
                  "bg-white/[0.02] border-white/5 opacity-50"
                }`}
                data-testid={`pipeline-stage-${s.stage}`}
              >
                <span className="flex-shrink-0">
                    {s.icon === "scan" && <Scan className="w-5 h-5" />}
                    {s.icon === "brain" && <Brain className="w-5 h-5" />}
                    {s.icon === "pencil" && <Pencil className="w-5 h-5" />}
                    {s.icon === "search" && <Search className="w-5 h-5" />}
                  </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? "text-emerald-400" : isActive ? "text-violet-300" : "text-slate-500"}`}>
                    {s.aiName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {isDone ? "Complete" : isActive ? stageLabel : s.label.replace("...", "")}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-white/10" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (generatedQuestions) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Pencil className="w-5 h-5 text-violet-400" />
            Review & Edit ({generatedQuestions.length} questions)
          </h3>
          <div className="flex gap-2">
            <Button className="glow-button-outline" size="sm" onClick={() => { setGeneratedQuestions(null); }} data-testid="button-discard-generated">
              Discard
            </Button>
            <Button className="glow-button" size="sm" onClick={handlePublish} disabled={saveMutation.isPending || generatedQuestions.length === 0} data-testid="button-publish-generated">
              <Save className="w-4 h-4 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save & Publish Quiz"}
            </Button>
          </div>
        </div>
        <div className="p-5 space-y-6">
          {generatedQuestions.map((q, idx) => (
            <div key={idx} className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/[0.02]" data-testid={`card-generated-q-${idx}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm text-violet-400 font-medium shrink-0">Q{idx + 1}</span>
                <Button variant="ghost" size="icon" className="text-slate-500 hover:text-red-400" onClick={() => removeQuestion(idx)} data-testid={`button-remove-generated-${idx}`}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Question Text (LaTeX)</Label>
                <Textarea
                  value={q.prompt_text}
                  onChange={(e) => updateQuestion(idx, "prompt_text", e.target.value)}
                  className="glass-input font-mono text-sm min-h-[60px]"
                  data-testid={`input-generated-prompt-${idx}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Image URL (optional)</Label>
                <Input
                  value={q.image_url ?? ""}
                  onChange={(e) => updateQuestion(idx, "image_url", e.target.value || null)}
                  placeholder="https://example.com/diagram.png"
                  className="glass-input font-mono text-sm"
                  data-testid={`input-generated-image-url-${idx}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="space-y-1">
                    <Label className="text-xs text-slate-500">Option {String.fromCharCode(65 + optIdx)}</Label>
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                      className="glass-input font-mono text-sm"
                      data-testid={`input-generated-opt-${idx}-${optIdx}`}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Correct Answer</Label>
                  <Input
                    value={q.correct_answer}
                    onChange={(e) => updateQuestion(idx, "correct_answer", e.target.value)}
                    className="glass-input font-mono text-sm"
                    data-testid={`input-generated-answer-${idx}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Marks</Label>
                  <Input
                    type="number"
                    min="1"
                    value={q.marks_worth}
                    onChange={(e) => updateQuestion(idx, "marks_worth", parseInt(e.target.value) || 1)}
                    className="glass-input font-mono text-sm"
                    data-testid={`input-generated-marks-${idx}`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor={`img-upload-${idx}`} className="cursor-pointer">
                  <div className="flex items-center gap-1.5 text-sm text-slate-400 border border-white/10 rounded-lg px-3 py-1.5 hover:border-violet-500/30 transition-colors">
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
                    <img src={q.image_url} alt="attached" className="h-10 w-10 object-cover rounded-lg border border-white/10" />
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-400" onClick={() => updateQuestion(idx, "image_url", null)}>Remove</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-violet-400" />
        Generate Questions from PDF
      </h3>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Upload a math assessment PDF and a 4-stage AI pipeline (Gemini, DeepSeek, Claude, ChatGPT) will
          extract, solve, format, and validate multiple-choice questions. You'll be able to review and edit before publishing.
        </p>
        <div className="space-y-2">
          <Label htmlFor="pdfFile" className="text-slate-300">Select PDF file</Label>
          <Input id="pdfFile" type="file" accept=".pdf" onChange={handlePdfUpload} className="glass-input" data-testid="input-pdf-upload" />
        </div>
        <div className="flex justify-end">
          <Button type="button" className="glow-button-outline" onClick={onDone} data-testid="button-cancel-pdf">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function StudentAnalysis({ submission, questions, quizTitle }: { submission: Submission & { student: Student }; questions: Question[]; quizTitle: string }) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Performance_Report_${submission.student.firstName}_${submission.student.lastName}`,
  });

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const numberedQuestions = questions.map((q, idx) => ({ ...q, displayNumber: idx + 1 }));
      const res = await apiRequest("POST", "/api/analyze-student", { submission, questions: numberedQuestions });
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const percentage = submission.maxPossibleScore > 0
    ? Math.round((submission.totalScore / submission.maxPossibleScore) * 100)
    : 0;

  const submittedDate = submission.submittedAt ? format(new Date(submission.submittedAt), "PPP") : "N/A";

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
        <div className="mt-3 border border-white/10 rounded-xl p-4 bg-white/[0.03]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5 text-slate-200">
              <Brain className="w-4 h-4 text-violet-400" />
              AI Analysis
            </h4>
            <div className="flex items-center gap-2">
              <Button className="glow-button-outline text-sm" size="sm" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-1" />
                Download PDF
              </Button>
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200" onClick={() => setAnalysis(null)}>Close</Button>
            </div>
          </div>
          <div ref={printRef} className="print-report">
            <div className="hidden print:block mb-6" style={{ borderBottom: '2px solid #7c3aed', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <img src="/MCEC - White Logo.png" alt="MCEC Logo" style={{ height: '48px', width: 'auto' }} />
                <div>
                  <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>SOMA Assessment Platform</h1>
                  <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>By Melania Calvin Educational Consultants</p>
                </div>
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '8px 0 4px' }}>
                Performance Report for {submission.student.firstName} {submission.student.lastName}
              </h2>
              <p style={{ fontSize: '13px', color: '#444', margin: '2px 0' }}>Topic: {quizTitle}</p>
              <p style={{ fontSize: '13px', color: '#444', margin: '2px 0' }}>Date Taken: {submittedDate}</p>
              <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '8px 0 0', color: '#7c3aed' }}>
                Grade: {percentage}% ({submission.totalScore}/{submission.maxPossibleScore})
              </p>
            </div>
            <div
              className="prose prose-sm prose-invert max-w-none text-sm text-slate-300 print:prose print:text-black"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(analysis) }}
              data-testid={`text-analysis-${submission.id}`}
            />
          </div>
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
      toast({ title: "Assessment deleted", description: "Assessment, questions, and submissions were removed." });
      onDeleted();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete assessment", description: err.message, variant: "destructive" });
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
      (s.maxPossibleScore > 0 ? ((s.totalScore / s.maxPossibleScore) * 100).toFixed(1) : "0.0") + "%",
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
        <Button className="glow-button-outline" size="sm" onClick={onBack} data-testid="button-back-admin">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Assessments
        </Button>
        <Button
          size="sm"
          className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl"
          onClick={() => {
            if (confirm("Delete this entire assessment? This will remove questions and all submitted results.")) {
              deleteQuizMutation.mutate();
            }
          }}
          disabled={deleteQuizMutation.isPending}
          data-testid="button-delete-exam"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          {deleteQuizMutation.isPending ? "Deleting..." : "Delete Assessment"}
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate gradient-text" data-testid="text-quiz-detail-title">{quiz.title}</h2>
          <div className="flex items-center gap-3 text-sm text-slate-400 mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-violet-400" />{quiz.timeLimitMinutes} min</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-violet-400" />Due {format(new Date(quiz.dueDate), "PPP")}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button className="glow-button-outline text-sm" size="sm" onClick={() => { setShowUploader(!showUploader); setShowPdfGen(false); }} data-testid="button-toggle-uploader">
          <Upload className="w-4 h-4 mr-1" />
          Add Questions (JSON)
        </Button>
        <Button className="glow-button-outline text-sm" size="sm" onClick={() => { setShowPdfGen(!showPdfGen); setShowUploader(false); }} data-testid="button-toggle-pdf">
          <FileText className="w-4 h-4 mr-1" />
          Generate from PDF
        </Button>
        <Link href="/admin/builder">
          <Button className="glow-button-outline text-sm" size="sm">AI Builder</Button>
        </Link>
        <Link href={`/admin/analytics/${quizId}`}>
          <Button className="glow-button-outline text-sm" size="sm">Class Analytics</Button>
        </Link>
        <Button className="glow-button-outline text-sm" size="sm" onClick={() => setShowResults(!showResults)} data-testid="button-toggle-results">
          <Users className="w-4 h-4 mr-1" />
          View Results ({submissions?.length ?? 0})
        </Button>
        {submissions && submissions.length > 0 && (
          <>
            <Button className="glow-button-outline text-sm" size="sm" onClick={downloadCSV} data-testid="button-download-csv">
              <Download className="w-4 h-4 mr-1" />
              Download CSV
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="bg-red-500/10 border border-red-500/30 text-red-400"
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
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="text-lg font-semibold text-slate-100">Submissions</h3>
          </div>
          <div className="p-5">
            {submissions.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No submissions yet.</p>
            ) : (
              <div className="space-y-4">
                {submissions.map((s) => (
                  <div key={s.id} className="border border-white/10 rounded-xl p-4 bg-white/[0.02]" data-testid={`row-submission-${s.id}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-slate-200">{s.student.firstName} {s.student.lastName}</p>
                        <p className="text-sm text-slate-400">{format(new Date(s.submittedAt), "PP p")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-200">{s.totalScore}/{s.maxPossibleScore}</span>
                        <Badge className={s.totalScore / s.maxPossibleScore >= 0.5
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/10 text-red-400 border-red-500/30"
                        }>
                          {((s.totalScore / s.maxPossibleScore) * 100).toFixed(0)}%
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-white/10 text-slate-400"
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
                    <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Marks Breakdown</p>
                      <div className="grid gap-1">
                        {Object.entries(s.answersBreakdown).map(([questionId, detail]) => (
                          <div key={questionId} className="text-sm flex items-center justify-between gap-2">
                            <span className="text-slate-300">Q{questionId}: {detail.answer || "No answer"}</span>
                            <span className={detail.correct ? "text-emerald-400" : "text-slate-500"}>
                              {detail.correct ? `+${detail.marksEarned}` : "0"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3">
                      <StudentAnalysis submission={s} questions={questions || []} quizTitle={quiz.title} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="text-lg font-semibold text-slate-100">
            Questions ({questionsLoading ? "..." : questions?.length ?? 0})
          </h3>
        </div>
        <div className="p-5">
          {questionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-white/5" />)}
            </div>
          ) : !questions || questions.length === 0 ? (
            <div className="text-center py-8">
              <FileJson className="w-10 h-10 mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No questions added yet. Upload JSON or generate from a PDF.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="border border-white/10 rounded-xl p-3 flex items-start gap-3 bg-white/[0.02]" data-testid={`card-question-${q.id}`}>
                  <span className="text-sm font-mono text-violet-400 font-medium mt-0.5 shrink-0 w-7">
                    Q{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-slate-200">{q.promptText}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className="bg-white/5 text-slate-400 border-white/10">{q.options.length} options</Badge>
                      <Badge className="bg-white/5 text-slate-400 border-white/10">[{q.marksWorth}] marks</Badge>
                      {q.imageUrl && <Badge className="bg-white/5 text-slate-400 border-white/10">Has image</Badge>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="border-white/10 text-slate-400"
                    onClick={() => deleteQuestionMutation.mutate(q.id)}
                    data-testid={`button-delete-question-${q.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
    window.location.href = "/";
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
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-xl font-bold gradient-text" data-testid="text-admin-title">Admin Dashboard</h1>
              <p className="text-xs text-slate-400">Manage quizzes and view results</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/builder">
              <Button className="glow-button-outline text-sm" size="sm" data-testid="button-ai-builder">
                <MessageSquare className="w-4 h-4 mr-1" />
                AI Builder
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="border-white/10 text-slate-400 hover:text-slate-200" onClick={handleLogout} data-testid="button-admin-logout">
              <LogOut className="w-4 h-4 mr-1" />
              Log Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {selectedQuizId !== null ? (
          <QuizDetail quizId={selectedQuizId} onBack={() => setSelectedQuizId(null)} onDeleted={() => setSelectedQuizId(null)} />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-100">Quizzes</h2>
              <Button size="sm" className="glow-button" onClick={() => setShowCreateForm(true)} data-testid="button-create-quiz">
                <Plus className="w-4 h-4 mr-1" />
                New Quiz
              </Button>
            </div>

            {showCreateForm && (
              <CreateQuizForm onClose={() => setShowCreateForm(false)} />
            )}

            {quizzesError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 p-4">
                Failed to load quizzes. Please refresh and try again.
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full bg-white/5" />)}
              </div>
            ) : !quizzes || quizzes.length === 0 ? (
              <div className="text-center py-16">
                <BookOpen className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <h3 className="text-lg font-medium text-slate-400">No quizzes yet</h3>
                <p className="text-sm text-slate-500 mt-1">Create your first quiz to get started.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {quizzes.map((quiz) => {
                  const isClosed = new Date(quiz.dueDate) < new Date();
                  return (
                    <div
                      key={quiz.id}
                      className="glass-card p-4 cursor-pointer transition-all duration-200 hover:border-violet-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                      onClick={() => setSelectedQuizId(quiz.id)}
                      data-testid={`card-admin-quiz-${quiz.id}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 border border-violet-500/20">
                            <BookOpen className="w-4 h-4 text-violet-400" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate text-slate-100">{quiz.title}</h3>
                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                              <span>{quiz.timeLimitMinutes} min</span>
                              <span>Due {format(new Date(quiz.dueDate), "PP")}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={isClosed
                            ? "bg-slate-700/50 text-slate-400 border-slate-600"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }>
                            {isClosed ? "Closed" : "Open"}
                          </Badge>
                          <Eye className="w-4 h-4 text-slate-500" />
                        </div>
                      </div>
                    </div>
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
