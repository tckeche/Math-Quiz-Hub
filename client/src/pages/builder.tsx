import { useState, useEffect, useRef, useMemo } from "react";
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
  FileText, X, Pencil, BookOpen,
  Scan, Brain, Search, CheckCircle2, Eye, PartyPopper, LayoutDashboard
} from "lucide-react";
import 'katex/dist/katex.min.css';
import { renderLatex, unescapeLatex } from '@/lib/render-latex';
import SomaQuizEngine from "./soma-quiz";
import type { StudentQuestion } from "./soma-quiz";

const LEVEL_OPTIONS = ["University", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "IGCSE", "AS", "A2", "Other"];

const PIPELINE_STAGES = [
  { stage: 1, icon: "search", label: "Fetching Context...", aiName: "Context Engine" },
  { stage: 2, icon: "brain", label: "Claude is drafting questions...", aiName: "Claude Sonnet" },
  { stage: 3, icon: "scan", label: "Gemini is auditing quality...", aiName: "Gemini QA" },
  { stage: 4, icon: "pencil", label: "Saving to database...", aiName: "Database" },
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
  const [savedQuestions, setSavedQuestions] = useState<Question[]>([]);
  const [populated, setPopulated] = useState(false);
  const [activeQuizId, setActiveQuizId] = useState<number | null>(editId);

  const [pipelineActive, setPipelineActive] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());

  const [showPreview, setShowPreview] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  const [metaDirty, setMetaDirty] = useState(false);
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
    queryKey: ["/api/admin/quizzes", activeQuizId],
    enabled: authenticated && activeQuizId !== null,
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
    if (quizData?.questions) {
      setSavedQuestions(quizData.questions);
    }
  }, [quizData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const ensureQuizExists = async (): Promise<number> => {
    if (activeQuizId) return activeQuizId;
    if (!title.trim()) throw new Error("Please fill in a quiz title before generating questions.");
    if (!dueDate) throw new Error("Please set a due date before generating questions.");
    const tl = parseInt(timeLimit);
    if (isNaN(tl) || tl < 1) throw new Error("Time limit must be a positive number.");
    const quizRes = await apiRequest("POST", "/api/admin/quizzes", {
      title: title.trim(),
      timeLimitMinutes: tl,
      dueDate,
      syllabus: syllabus || null,
      level: level || null,
      subject: subject || null,
    });
    const quiz = await quizRes.json();
    setActiveQuizId(quiz.id);
    return quiz.id;
  };

  const animatePipeline = (stage: number) => {
    setPipelineActive(true);
    setCurrentStage(stage);
    setCompletedStages((prev) => {
      const next = new Set(prev);
      for (let i = 1; i < stage; i++) next.add(i);
      return next;
    });
  };

  const finishPipeline = () => {
    setCompletedStages(new Set([1, 2, 3, 4]));
    setCurrentStage(0);
    setTimeout(() => setPipelineActive(false), 1500);
  };

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      animatePipeline(1);
      const context = [
        subject && `Subject: ${subject}`,
        level && `Level: ${level}`,
        syllabus && `Syllabus: ${syllabus}`,
      ].filter(Boolean).join(", ");
      const enrichedMessage = context ? `[${context}]\n\n${message}` : message;
      const docIds = docContext.map((d) => d.fileId);

      animatePipeline(2);
      const res = await apiRequest("POST", "/api/admin/copilot-chat", {
        message: enrichedMessage,
        documentIds: docIds.length > 0 ? docIds : undefined,
      });
      const data = await res.json();

      if (data.needsClarification) {
        setPipelineActive(false);
        return { ...data, savedToDb: false };
      }

      if (Array.isArray(data.drafts) && data.drafts.length > 0) {
        animatePipeline(3);
        const quizId = await ensureQuizExists();

        animatePipeline(4);
        await apiRequest("POST", `/api/admin/quizzes/${quizId}/questions`, { questions: data.drafts });

        await queryClient.refetchQueries({ queryKey: ["/api/admin/quizzes", quizId] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });

        const refetched = queryClient.getQueryData<Quiz & { questions: Question[] }>(["/api/admin/quizzes", quizId]);
        if (refetched?.questions) {
          setSavedQuestions(refetched.questions);
        }

        finishPipeline();
        return { ...data, savedToDb: true, savedCount: data.drafts.length };
      }

      setPipelineActive(false);
      return { ...data, savedToDb: false };
    },
    onSuccess: (data, message) => {
      setChat((prev) => [...prev, { role: "user", text: message }, { role: "ai", text: data.reply, metadata: data.metadata }]);
      if (data.savedToDb) {
        setLastSavedCount(data.savedCount);
        setShowSuccessModal(true);
      }
      setMsg("");
    },
    onError: (err: Error) => {
      setPipelineActive(false);
      toast({ title: "Copilot failed", description: err.message, variant: "destructive" });
    },
  });

  const updateMetaMutation = useMutation({
    mutationFn: async () => {
      if (!activeQuizId) throw new Error("No quiz to update");
      const tl = parseInt(timeLimit);
      if (isNaN(tl) || tl < 1) throw new Error("Time limit must be a positive number");
      if (!title.trim()) throw new Error("Title is required");
      if (!dueDate) throw new Error("Due date is required");
      await apiRequest("PUT", `/api/admin/quizzes/${activeQuizId}`, {
        title: title.trim(),
        timeLimitMinutes: tl,
        dueDate,
        syllabus: syllabus || null,
        level: level || null,
        subject: subject || null,
      });
    },
    onSuccess: () => {
      setMetaDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", activeQuizId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });
      toast({ title: "Quiz details updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) =>
      apiRequest("DELETE", `/api/admin/questions/${questionId}`),
    onSuccess: (_data, questionId) => {
      setSavedQuestions((prev) => prev.filter((q) => q.id !== questionId));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", activeQuizId] });
      toast({ title: "Question deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete question", description: err.message, variant: "destructive" }),
  });

  const handleSupportingDoc = async (file: File, docType: string) => {
    const docEntry = { name: file.name, type: docType, processing: true };
    setSupportingDocs((prev) => [...prev, docEntry]);
    try {
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
      setSupportingDocs((prev) =>
        prev.map((d) => (d.name === file.name && d.type === docType ? { ...d, processing: false } : d))
      );
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

  const totalQuestions = savedQuestions.length;

  const previewQuestions = useMemo(() =>
    savedQuestions.map((q) => ({
      id: q.id,
      quizId: activeQuizId || 0,
      stem: unescapeLatex(q.promptText),
      options: q.options,
      marks: q.marksWorth,
    } as StudentQuestion)), [savedQuestions, activeQuizId]);

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
                  {activeQuizId ? "Edit Assessment" : "New Assessment"}
                </h1>
                {activeQuizId && <p className="text-xs text-slate-500">ID: {activeQuizId}</p>}
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
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-violet-400" />
              <h2 className="font-semibold text-slate-100 text-sm">Quiz Parameters</h2>
              {activeQuizId && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] ml-auto">Live &middot; ID {activeQuizId}</Badge>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="col-span-2 md:col-span-1 space-y-1">
                <Label className="text-slate-400 text-xs">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); if (activeQuizId) setMetaDirty(true); }}
                  placeholder="e.g. Pure Mathematics Paper 1"
                  className="glass-input text-sm"
                  data-testid="input-quiz-title"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-slate-400 text-xs uppercase">Syllabus</Label>
                <Input
                  value={syllabus}
                  onChange={(e) => { setSyllabus(e.target.value); if (activeQuizId) setMetaDirty(true); }}
                  placeholder="Cambridge, Edexcel"
                  className="glass-input text-sm"
                  data-testid="input-quiz-syllabus"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-400 text-xs uppercase">Level</Label>
                <select
                  className="w-full glass-input px-2.5 rounded-lg bg-black/20 border border-white/10 text-slate-200 text-sm"
                  value={level}
                  onChange={(e) => { setLevel(e.target.value); if (activeQuizId) setMetaDirty(true); }}
                  data-testid="select-quiz-level"
                >
                  <option value="">Select level</option>
                  {LEVEL_OPTIONS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-slate-400 text-xs uppercase">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); if (activeQuizId) setMetaDirty(true); }}
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
                  onChange={(e) => { setDueDate(e.target.value); if (activeQuizId) setMetaDirty(true); }}
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
                  onChange={(e) => { setTimeLimit(e.target.value); if (activeQuizId) setMetaDirty(true); }}
                  className="glass-input text-sm"
                  data-testid="input-quiz-time"
                />
              </div>
            </div>
            {metaDirty && activeQuizId && (
              <div className="mt-3 flex justify-end">
                <Button
                  className="glow-button text-xs"
                  size="sm"
                  onClick={() => updateMetaMutation.mutate()}
                  disabled={updateMetaMutation.isPending || !title.trim() || !dueDate}
                  data-testid="button-save-metadata"
                >
                  {updateMetaMutation.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</>
                  ) : (
                    <>Save Changes</>
                  )}
                </Button>
              </div>
            )}
          </div>

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
                        isActive ? "bg-violet-500/10 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]" :
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
                        {isActive ? s.label : s.aiName}
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

          <div className="space-y-3">
            {savedQuestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                  Saved Questions ({savedQuestions.length})
                </p>
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

            {savedQuestions.length === 0 && !pipelineActive && (
              <div className="glass-card p-8 text-center space-y-2">
                <FileStack className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm text-slate-500">No questions yet.</p>
                <p className="text-xs text-slate-600">Use the AI Co-Pilot to generate and auto-save questions.</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="glass-card flex flex-col overflow-hidden sticky top-16 z-10" style={{ height: "calc(100vh - 90px)" }}>
            <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-semibold text-slate-300" data-testid="tab-copilot">AI Co-Pilot</span>
              {pipelineActive && <Loader2 className="w-3 h-3 animate-spin text-violet-400 ml-auto" />}
            </div>
            <div className="flex-1 p-2.5 overflow-auto space-y-2">
              {chat.length === 0 && (
                <div className="text-center pt-8 space-y-1.5">
                  <Sparkles className="w-6 h-6 mx-auto text-violet-400/50" />
                  <p className="text-xs text-slate-500">Ask the AI to generate quiz questions.</p>
                  <p className="text-[10px] text-slate-600 leading-relaxed">Questions are auto-saved to the database.</p>
                  <p className="text-[10px] text-slate-600">"Generate 5 IGCSE quadratics MCQs"</p>
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
                  placeholder={activeQuizId ? "Ask to edit or add questions..." : "Ask for questions..."}
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

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="modal-success">
          <div className="glass-card w-full max-w-md p-8 text-center space-y-5 border border-violet-500/20 shadow-[0_0_40px_rgba(139,92,246,0.15)]">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-violet-500/20 flex items-center justify-center mx-auto border border-emerald-500/30">
              <PartyPopper className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 mb-1" data-testid="text-success-title">Quiz Created Successfully!</h2>
              <p className="text-sm text-slate-400">
                {lastSavedCount} question{lastSavedCount !== 1 ? "s" : ""} generated, audited, and saved to the database.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                className="w-full glow-button"
                onClick={() => { setShowSuccessModal(false); setShowPreview(true); }}
                data-testid="button-success-preview"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Quiz
              </Button>
              <Link href="/admin">
                <Button className="w-full glow-button-outline" data-testid="button-success-dashboard">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto" data-testid="modal-preview">
          <SomaQuizEngine
            previewMode={true}
            previewTitle={title || "Untitled Quiz"}
            previewQuestions={previewQuestions}
            onExitPreview={() => setShowPreview(false)}
          />
        </div>
      )}
    </div>
  );
}
