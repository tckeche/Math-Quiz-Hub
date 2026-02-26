import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Quiz, Question } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft, Send, Loader2, Sparkles, FileStack, Upload, Trash2,
  Plus, Save, FileText, ImagePlus, X, Pencil, BookOpen,
  Scan, Brain, Search, CheckCircle2, Eye
} from "lucide-react";
import 'katex/dist/katex.min.css';
import { renderLatex, unescapeLatex } from '@/lib/render-latex';
import SomaQuizEngine from "./soma-quiz";
import type { StudentQuestion } from "./soma-quiz";

type DraftQuestion = {
  id?: number;
  prompt_text: string;
  options: string[];
  correct_answer: string;
  marks_worth: number;
  image_url?: string | null;
};

const LEVEL_OPTIONS = ["IGCSE", "AS", "A2", "IB1", "IB2", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "Other"];

const PIPELINE_STAGES = [
  { stage: 1, icon: "scan", label: "Gemini is reading the PDF...", aiName: "Google Gemini" },
  { stage: 2, icon: "brain", label: "DeepSeek is analysing the content...", aiName: "DeepSeek R1" },
  { stage: 3, icon: "pencil", label: "Claude is formatting the questions...", aiName: "Claude Sonnet" },
  { stage: 4, icon: "search", label: "ChatGPT is validating the database schema...", aiName: "GPT-4o" },
];

export default function BuilderPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const editId = params.id ? parseInt(params.id) : null;
  const isEditMode = editId !== null;

  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState("60");
  const [dueDate, setDueDate] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [level, setLevel] = useState("");
  const [subject, setSubject] = useState("");

  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string; metadata?: { provider: string; model: string; durationMs: number } }[]>([]);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [savedQuestions, setSavedQuestions] = useState<Question[]>([]);
  const [populated, setPopulated] = useState(false);

  const [pipelineActive, setPipelineActive] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());
  const [stageLabel, setStageLabel] = useState("");

  const [showPreview, setShowPreview] = useState(false);
  const [supportingDocs, setSupportingDocs] = useState<{ name: string; type: string; processing: boolean }[]>([]);
  const [docContext, setDocContext] = useState<{ name: string; type: string; fileId: string }[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: adminSession, isLoading: sessionLoading, error: sessionError } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/admin/session"],
    queryFn: async () => {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      return res.json();
    },
  });

  const authenticated = adminSession?.authenticated === true;

  const { data: quizData, isLoading: quizLoading } = useQuery<Quiz & { questions: Question[] }>({
    queryKey: ["/api/admin/quizzes", editId],
    enabled: authenticated && isEditMode,
  });

  useEffect(() => {
    if (quizData && !populated) {
      setTitle(quizData.title);
      setTimeLimit(String(quizData.timeLimitMinutes));
      setDueDate(quizData.dueDate ? new Date(quizData.dueDate).toISOString().slice(0, 16) : "");
      setSyllabus(quizData.syllabus || "");
      setLevel(quizData.level || "");
      setSubject(quizData.subject || "");
      if (quizData.questions) {
        setSavedQuestions(quizData.questions);
      }
      setPopulated(true);
    }
  }, [quizData, populated]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      // Prepend subject/level/syllabus context so the AI generates relevant questions
      const context = [
        subject && `Subject: ${subject}`,
        level && `Level: ${level}`,
        syllabus && `Syllabus: ${syllabus}`,
      ].filter(Boolean).join(", ");
      const enrichedMessage = context ? `[${context}]\n\n${message}` : message;
      // Pass uploaded PDF file IDs so the copilot sends actual PDFs to Gemini
      const docIds = docContext.map((d) => d.fileId);
      const res = await apiRequest("POST", "/api/admin/copilot-chat", {
        message: enrichedMessage,
        documentIds: docIds.length > 0 ? docIds : undefined,
      });
      return res.json();
    },
    onSuccess: (data, message) => {
      setChat((prev) => [...prev, { role: "user", text: message }, { role: "ai", text: data.reply, metadata: data.metadata }]);
      if (Array.isArray(data.drafts) && data.drafts.length > 0) {
        setDrafts((prev) => [...prev, ...data.drafts]);
        toast({ title: `${data.drafts.length} draft questions generated` });
      }
      setMsg("");
    },
    onError: (err: Error) => toast({ title: "Copilot failed", description: err.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      if (!dueDate) throw new Error("Due date is required");
      const tl = parseInt(timeLimit);
      if (isNaN(tl) || tl < 1) throw new Error("Time limit must be a positive number");
      const quizRes = await apiRequest("POST", "/api/admin/quizzes", {
        title: title.trim(),
        timeLimitMinutes: tl,
        dueDate,
        syllabus: syllabus || null,
        level: level || null,
        subject: subject || null,
      });
      const quiz = await quizRes.json();
      if (drafts.length > 0) {
        await apiRequest("POST", `/api/admin/quizzes/${quiz.id}/questions`, { questions: drafts });
      }
      return quiz;
    },
    onSuccess: async (quiz) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });
      toast({ title: "Quiz created successfully" });

      // Run Gemini validation in background before navigating
      if (drafts.length > 0) {
        try {
          toast({ title: "Validating quiz with AI...", description: "Checking correctness and formatting" });
          const valRes = await apiRequest("POST", "/api/admin/validate-quiz", { questions: drafts });
          const valData = await valRes.json();
          const v = valData.validation;
          if (v?.overall === "pass") {
            toast({ title: "Quiz validated", description: `All ${drafts.length} questions passed AI review` });
          } else if (v?.issues?.length > 0) {
            const errorCount = v.issues.filter((i: any) => i.severity === "error").length;
            const warnCount = v.issues.filter((i: any) => i.severity === "warning").length;
            toast({
              title: `Validation: ${errorCount} error(s), ${warnCount} warning(s)`,
              description: v.summary || "Review your questions for potential issues",
              variant: errorCount > 0 ? "destructive" : "default",
            });
          }
        } catch {
          // Validation failure shouldn't block quiz creation
        }
      }

      navigate("/admin");
    },
    onError: (err: Error) => toast({ title: "Failed to create quiz", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("No quiz ID");
      const tl = parseInt(timeLimit);
      if (isNaN(tl) || tl < 1) throw new Error("Time limit must be a positive number");
      if (!title.trim()) throw new Error("Title is required");
      if (!dueDate) throw new Error("Due date is required");
      await apiRequest("PUT", `/api/admin/quizzes/${editId}`, {
        title: title.trim(),
        timeLimitMinutes: tl,
        dueDate,
        syllabus: syllabus || null,
        level: level || null,
        subject: subject || null,
      });
      if (drafts.length > 0) {
        await apiRequest("POST", `/api/admin/quizzes/${editId}/questions`, { questions: drafts });
      }
    },
    onSuccess: async () => {
      setDrafts([]);
      await queryClient.refetchQueries({ queryKey: ["/api/admin/quizzes", editId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });
      const refetched = queryClient.getQueryData<Quiz & { questions: Question[] }>(["/api/admin/quizzes", editId]);
      if (refetched?.questions) {
        setSavedQuestions(refetched.questions);
      }
      toast({ title: "Changes saved" });
    },
    onError: (err: Error) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) =>
      apiRequest("DELETE", `/api/admin/questions/${questionId}`),
    onSuccess: (_data, questionId) => {
      setSavedQuestions((prev) => prev.filter((q) => q.id !== questionId));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", editId] });
      toast({ title: "Question deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete question", description: err.message, variant: "destructive" }),
  });

  const handleAttachImage = async (index: number, file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/upload-image", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) throw new Error("Image upload failed");
    const data = await res.json();
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, image_url: data.url } : d)));
  };

  const startPipeline = async (file: File) => {
    setPipelineActive(true);
    setCurrentStage(0);
    setCompletedStages(new Set());
    setStageLabel("");

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch("/api/generate-questions", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok || !res.body) throw new Error("Server connection failed");

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
                setDrafts(prev => [...prev, ...data.questions]);
                toast({ title: `${data.questions.length} questions extracted from PDF` });
              } else if (evType === "error") {
                throw new Error(data.message);
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            }
          }
        }
      }
    } catch (err: any) {
      toast({ title: "AI pipeline failed", description: err.message, variant: "destructive" });
    } finally {
      setPipelineActive(false);
    }
  };

  const handleSupportingDoc = async (file: File, docType: string) => {
    const docEntry = { name: file.name, type: docType, processing: true };
    setSupportingDocs((prev) => [...prev, docEntry]);
    try {
      // Upload the PDF to the server so the copilot can reference the original file
      const uploadForm = new FormData();
      uploadForm.append("pdf", file);
      const uploadRes = await fetch("/api/admin/upload-supporting-doc", {
        method: "POST",
        body: uploadForm,
        credentials: "include",
      });
      let fileId: string | null = null;
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        fileId = uploadData.id;
      }

      // Also run the pipeline to extract questions
      await startPipeline(file);
      setSupportingDocs((prev) =>
        prev.map((d) => (d.name === file.name && d.type === docType ? { ...d, processing: false } : d))
      );
      // Store the file reference so the copilot can send the actual PDF to Gemini
      if (fileId) {
        setDocContext((prev) => [...prev, { name: file.name, type: docType, fileId }]);
      }
    } catch {
      setSupportingDocs((prev) => prev.filter((d) => !(d.name === file.name && d.type === docType)));
    }
  };

  const handleSend = () => {
    if (!msg.trim() || chatMutation.isPending) return;
    chatMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addManualQuestion = () => {
    setDrafts(prev => [...prev, {
      prompt_text: "",
      options: ["", "", "", ""],
      correct_answer: "",
      marks_worth: 1,
      image_url: null,
    }]);
  };

  const totalQuestions = savedQuestions.length + drafts.length;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (sessionError) {
    return <div className="min-h-screen bg-background p-6 text-red-400">Failed to verify admin session.</div>;
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card p-8 text-center">
          <p className="text-slate-300">Please log in via <Link href="/admin" className="text-violet-400 underline">/admin</Link> first.</p>
        </div>
      </div>
    );
  }

  if (isEditMode && quizLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm">
          <div className="max-w-[1400px] mx-auto px-6 py-4">
            <Skeleton className="h-8 w-48 bg-white/5" />
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto p-6 space-y-4">
          <Skeleton className="h-64 w-full bg-white/5" />
          <Skeleton className="h-64 w-full bg-white/5" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button className="glow-button-outline" size="sm" data-testid="button-back-admin">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-8 w-auto object-contain" />
              <div>
                <h1 className="text-lg font-bold gradient-text" data-testid="text-builder-title">
                  {isEditMode ? "Edit Assessment" : "New Assessment"}
                </h1>
                {isEditMode && <p className="text-xs text-slate-500">ID: {editId}</p>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/5 text-slate-400 border-white/10">
              {totalQuestions} question{totalQuestions !== 1 ? "s" : ""}
            </Badge>
            <Button
              className="border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all"
              size="sm"
              onClick={() => setShowPreview(true)}
              disabled={totalQuestions === 0}
              data-testid="button-preview-quiz"
            >
              <Eye className="w-4 h-4 mr-1.5" />
              Preview Quiz
            </Button>
            <Button
              className="glow-button"
              size="sm"
              onClick={() => isEditMode ? updateMutation.mutate() : createMutation.mutate()}
              disabled={isSaving || !title.trim() || !dueDate}
              data-testid="button-save-quiz"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{isEditMode ? "Saving..." : "Creating..."}</>
              ) : (
                <><Save className="w-4 h-4 mr-1.5" />{isEditMode ? "Save Changes" : "Create Quiz"}</>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-12 gap-4">
        {/* LEFT COLUMN — Main Workspace (9 cols) */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* Compact Settings Row */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-violet-400" />
              <h2 className="font-semibold text-slate-100 text-sm">Quiz Parameters</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-1 space-y-1">
                <Label className="text-slate-400 text-xs">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Pure Mathematics Paper 1"
                  className="glass-input text-sm"
                  data-testid="input-quiz-title"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">Syllabus</Label>
                <Input
                  value={syllabus}
                  onChange={(e) => setSyllabus(e.target.value)}
                  placeholder="Cambridge, Edexcel"
                  className="glass-input text-sm"
                  data-testid="input-quiz-syllabus"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">Level</Label>
                <select
                  className="w-full glass-input px-2.5 rounded-lg bg-black/20 border border-white/10 text-slate-200 text-sm"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  data-testid="select-quiz-level"
                >
                  <option value="">Select level</option>
                  {LEVEL_OPTIONS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Mathematics"
                  className="glass-input text-sm"
                  data-testid="input-quiz-subject"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">Due Date</Label>
                <Input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="glass-input text-sm"
                  data-testid="input-quiz-due"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs">Time (min)</Label>
                <Input
                  type="number"
                  min="1"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  className="glass-input text-sm"
                  data-testid="input-quiz-time"
                />
              </div>
            </div>
          </div>

          {/* PDF Upload + Add Manual — compact inline row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="glass-card p-3 flex items-center gap-3 flex-1 min-w-[280px]">
              <FileText className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="text-xs text-slate-400 shrink-0">Generate from PDF</span>
              <Input
                type="file"
                accept=".pdf"
                className="glass-input text-xs flex-1"
                disabled={pipelineActive}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) startPipeline(file);
                }}
                data-testid="input-pdf-upload"
              />
            </div>
            <Button className="glow-button-outline text-xs shrink-0" size="sm" onClick={addManualQuestion} data-testid="button-add-manual">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Manually
            </Button>
          </div>

          {/* Supporting Documents */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="w-4 h-4 text-violet-400" />
              <h2 className="font-semibold text-slate-100 text-sm">Supporting Documents</h2>
              <span className="text-[10px] text-slate-500">(Syllabi, past papers, textbook excerpts)</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                id="doc-type-select"
                className="glass-input px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/10 text-slate-200 text-xs"
                defaultValue="past-paper"
                data-testid="select-doc-type"
              >
                <option value="past-paper">Past Exam Paper</option>
                <option value="syllabus">Cambridge Syllabus</option>
                <option value="textbook">Textbook Excerpt</option>
                <option value="notes">Custom Notes</option>
              </select>
              <Label htmlFor="supporting-doc-input" className="cursor-pointer">
                <div className="flex items-center gap-1.5 text-xs text-violet-300 border border-violet-500/30 bg-violet-500/10 rounded-lg px-3 py-1.5 hover:bg-violet-500/20 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Upload PDF
                </div>
                <input
                  id="supporting-doc-input"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  disabled={pipelineActive}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    const docType = (document.getElementById("doc-type-select") as HTMLSelectElement)?.value || "past-paper";
                    if (file) handleSupportingDoc(file, docType);
                    e.target.value = "";
                  }}
                  data-testid="input-supporting-doc"
                />
              </Label>
            </div>
            {supportingDocs.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {supportingDocs.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-1.5">
                    <FileText className="w-3 h-3 text-violet-400 shrink-0" />
                    <span className="truncate flex-1">{doc.name}</span>
                    <span className="text-[10px] uppercase text-slate-500 shrink-0">{doc.type}</span>
                    {doc.processing ? (
                      <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    )}
                    <button
                      className="text-slate-500 hover:text-red-400 shrink-0"
                      onClick={() => {
                        const removed = supportingDocs[i];
                        setSupportingDocs((prev) => prev.filter((_, j) => j !== i));
                        setDocContext((prev) => prev.filter((d) => !(d.name === removed.name && d.type === removed.type)));
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pipeline Progress */}
          {pipelineActive && (
            <div className="glass-card p-3">
              <div className="grid grid-cols-4 gap-2">
                {PIPELINE_STAGES.map((s) => {
                  const isDone = completedStages.has(s.stage);
                  const isActive = currentStage === s.stage && !isDone;
                  return (
                    <div
                      key={s.stage}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs transition-all ${
                        isDone ? "bg-emerald-500/10 border-emerald-500/30" :
                        isActive ? "bg-violet-500/10 border-violet-500/30" :
                        "bg-white/[0.02] border-white/5 opacity-40"
                      }`}
                      data-testid={`pipeline-stage-${s.stage}`}
                    >
                      <span className="shrink-0">
                        {s.icon === "scan" && <Scan className="w-3 h-3" />}
                        {s.icon === "brain" && <Brain className="w-3 h-3" />}
                        {s.icon === "pencil" && <Pencil className="w-3 h-3" />}
                        {s.icon === "search" && <Search className="w-3 h-3" />}
                      </span>
                      <span className={`flex-1 truncate ${isDone ? "text-emerald-400" : isActive ? "text-violet-300" : "text-slate-500"}`}>
                        {s.aiName}
                      </span>
                      {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
                       isActive ? <Loader2 className="w-3 h-3 animate-spin text-violet-400" /> :
                       <div className="w-3 h-3 rounded-full border border-white/10" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-3">
            {savedQuestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved Questions ({savedQuestions.length})</p>
                {savedQuestions.map((q, idx) => (
                  <div key={q.id} className="glass-card p-4 flex items-start gap-3" data-testid={`card-saved-q-${q.id}`}>
                    <span className="text-xs font-mono text-emerald-400 font-medium mt-0.5 shrink-0 w-7">Q{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 mb-1.5">{renderLatex(unescapeLatex(q.promptText))}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-white/5 text-slate-400 border-white/10 text-xs">{q.options.length} options</Badge>
                        <Badge className="bg-white/5 text-slate-400 border-white/10 text-xs">{q.marksWorth} marks</Badge>
                        {q.imageUrl && <Badge className="bg-white/5 text-slate-400 border-white/10 text-xs">Has image</Badge>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-slate-500 hover:text-red-400 shrink-0"
                      onClick={() => {
                        if (confirm("Delete this question permanently?")) {
                          deleteQuestionMutation.mutate(q.id);
                        }
                      }}
                      data-testid={`button-delete-saved-${q.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {drafts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                  New Drafts ({drafts.length}) — save to persist
                </p>
                {drafts.map((d, idx) => (
                  <div key={idx} className="glass-card p-4 space-y-2 border-violet-500/20" data-testid={`card-draft-q-${idx}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-violet-400">Draft {idx + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-slate-500 hover:text-red-400"
                        onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))}
                        data-testid={`button-remove-draft-${idx}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Textarea
                      value={d.prompt_text}
                      onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, prompt_text: e.target.value } : x))}
                      className="glass-input text-sm min-h-[60px]"
                      placeholder="Question text (supports LaTeX)"
                      data-testid={`input-draft-prompt-${idx}`}
                    />
                    {d.prompt_text && (
                      <div className="text-sm text-slate-300 bg-white/[0.03] border border-white/5 rounded-lg p-2">
                        {renderLatex(unescapeLatex(d.prompt_text))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {d.options.map((o, oi) => (
                        <Input
                          key={oi}
                          value={o}
                          onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, options: x.options.map((a, j) => j === oi ? e.target.value : a) } : x))}
                          className="glass-input text-sm"
                          placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                          data-testid={`input-draft-opt-${idx}-${oi}`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={d.correct_answer}
                        onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, correct_answer: e.target.value } : x))}
                        className="glass-input text-sm"
                        placeholder="Correct answer"
                        data-testid={`input-draft-answer-${idx}`}
                      />
                      <Input
                        type="number"
                        min={1}
                        value={d.marks_worth}
                        onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, marks_worth: Number(e.target.value) || 1 } : x))}
                        className="glass-input text-sm"
                        placeholder="Marks"
                        data-testid={`input-draft-marks-${idx}`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`draft-img-${idx}`} className="cursor-pointer">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 border border-white/10 rounded-lg px-2.5 py-1.5 hover:border-violet-500/30 transition-colors">
                          <ImagePlus className="w-3.5 h-3.5" />
                          {d.image_url ? "Change Image" : "Attach Image"}
                        </div>
                        <input
                          id={`draft-img-${idx}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleAttachImage(idx, f).catch((err) => toast({ title: "Upload failed", description: String(err), variant: "destructive" }));
                          }}
                        />
                      </Label>
                      {d.image_url && (
                        <div className="flex items-center gap-2">
                          <img src={d.image_url} alt="attached" className="h-8 w-8 object-cover rounded border border-white/10" />
                          <button className="text-xs text-slate-500 hover:text-red-400" onClick={() => setDrafts(prev => prev.map((x, i) => i === idx ? { ...x, image_url: null } : x))}>Remove</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {savedQuestions.length === 0 && drafts.length === 0 && (
              <div className="glass-card p-8 text-center space-y-2">
                <FileStack className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm text-slate-500">No questions yet.</p>
                <p className="text-xs text-slate-600">Use the AI Co-Pilot, upload a PDF, or add questions manually.</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Copilot Chat (3 cols) */}
        <div className="col-span-12 lg:col-span-3">
          <div className="glass-card flex flex-col overflow-hidden sticky top-16 z-10" style={{ height: "calc(100vh - 90px)" }}>
            <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-semibold text-slate-300" data-testid="tab-copilot">AI Co-Pilot</span>
            </div>
            <div className="flex-1 p-2.5 overflow-auto space-y-2">
              {chat.length === 0 && (
                <div className="text-center pt-8 space-y-1.5">
                  <Sparkles className="w-6 h-6 mx-auto text-violet-400/50" />
                  <p className="text-xs text-slate-500">Ask the AI to generate quiz questions.</p>
                  <p className="text-[10px] text-slate-600 leading-relaxed">"Generate 5 IGCSE differentiation MCQs"</p>
                </div>
              )}
              {docContext.length > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400">
                  <FileText className="w-3 h-3 shrink-0" />
                  {docContext.length} document{docContext.length > 1 ? "s" : ""} loaded as context
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <div className={`inline-block max-w-[92%] rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap leading-relaxed ${
                    m.role === "user"
                      ? "bg-violet-600/20 text-violet-200 border border-violet-500/20"
                      : "bg-white/5 text-slate-300 border border-white/5"
                  }`}>
                    {m.text}
                    {m.metadata && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-slate-900/50 border border-white/5 text-[9px] text-slate-400 font-mono" data-testid={`badge-telemetry-${i}`}>
                        <span>{m.metadata.model}</span>
                        <span>{(m.metadata.durationMs / 1000).toFixed(2)}s</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-2.5 border-t border-white/5">
              <div className="flex gap-1.5">
                <Textarea
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask for questions..."
                  className="glass-input flex-1 min-h-[36px] max-h-[80px] resize-none text-xs"
                  data-testid="input-copilot-message"
                />
                <Button
                  className="glow-button shrink-0 self-end"
                  size="icon"
                  onClick={handleSend}
                  disabled={!msg.trim() || chatMutation.isPending}
                  data-testid="button-copilot-send"
                >
                  {chatMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto" data-testid="modal-preview">
          <SomaQuizEngine
            previewMode={true}
            previewTitle={title || "Untitled Quiz"}
            previewQuestions={[
              ...savedQuestions.map((q, idx) => ({
                id: q.id,
                quizId: editId || 0,
                stem: unescapeLatex(q.promptText),
                options: q.options,
                marks: q.marksWorth,
              } as StudentQuestion)),
              ...drafts.map((d, idx) => ({
                id: -(idx + 1),
                quizId: editId || 0,
                stem: unescapeLatex(d.prompt_text),
                options: d.options,
                marks: d.marks_worth,
              } as StudentQuestion)),
            ]}
            onExitPreview={() => setShowPreview(false)}
          />
        </div>
      )}
    </div>
  );
}
