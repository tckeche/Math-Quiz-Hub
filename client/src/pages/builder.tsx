import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Quiz } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Send, Loader2, Sparkles, FileStack, Upload, Trash2 } from "lucide-react";
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';

const unescapeLatex = (str: string) => str.replace(/\\\\/g, '\\');

function renderLatex(text: string) {
  if (!text) return null;
  const parts = text.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith('\\(') && part.endsWith('\\)')) {
      return <InlineMath key={i} math={part.slice(2, -2)} />;
    }
    if (part.startsWith('\\[') && part.endsWith('\\]')) {
      return <BlockMath key={i} math={part.slice(2, -2)} />;
    }
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return <BlockMath key={i} math={part.slice(2, -2)} />;
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 1) {
      return <InlineMath key={i} math={part.slice(1, -1)} />;
    }
    return <span key={i}>{part}</span>;
  });
}

type DraftQuestion = {
  prompt_text: string;
  options: string[];
  correct_answer: string;
  marks_worth: number;
  image_url?: string | null;
};

export default function BuilderPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string; metadata?: { provider: string; model: string; durationMs: number } }[]>([]);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);

  const { data: adminSession, isLoading: sessionLoading, error: sessionError } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/admin/session"],
    queryFn: async () => {
      const res = await fetch("/api/admin/session", { credentials: "include" });
      return res.json();
    },
  });

  const authenticated = adminSession?.authenticated === true;

  const { data: quizzes } = useQuery<Quiz[]>({
    queryKey: ["/api/admin/quizzes"],
    enabled: authenticated,
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/admin/copilot-chat", { message });
      return res.json();
    },
    onSuccess: (data, message) => {
      setChat((prev) => [...prev, { role: "user", text: message }, { role: "ai", text: data.reply, metadata: data.metadata }]);
      if (Array.isArray(data.drafts) && data.drafts.length > 0) {
        setDrafts(data.drafts);
        toast({ title: `Loaded ${data.drafts.length} draft questions` });
      }
      setMsg("");
    },
    onError: (err: Error) => toast({ title: "Copilot failed", description: err.message, variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQuizId) throw new Error("Select a quiz first");
      return apiRequest("POST", `/api/admin/quizzes/${selectedQuizId}/questions`, { questions: drafts });
    },
    onSuccess: () => {
      if (selectedQuizId) queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes", selectedQuizId, "questions"] });
      toast({ title: "Drafts saved and published" });
      navigate("/admin");
    },
    onError: (err: Error) => toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const handleAttachImage = async (index: number, file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/upload-image", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) throw new Error("Image upload failed");
    const data = await res.json();
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, image_url: data.url } : d)));
  };

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button className="glow-button-outline" size="sm" data-testid="button-back-admin">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-8 w-auto object-contain" />
              <h1 className="text-lg font-bold gradient-text">AI Co-Pilot Builder</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h2 className="font-semibold text-slate-100">AI Co-Pilot Chat</h2>
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div className="h-[520px] overflow-auto rounded-xl bg-white/[0.02] border border-white/5 p-4 space-y-3">
              {chat.length === 0 && (
                <p className="text-sm text-slate-500 text-center pt-8">Ask the AI to generate quiz questions on any topic...</p>
              )}
              {chat.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <div className={`inline-block max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-violet-600/20 text-violet-200 border border-violet-500/20"
                      : "bg-white/5 text-slate-300 border border-white/5"
                  }`}>
                    {m.text}
                    {m.metadata && (
                      <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-md bg-slate-900/50 border border-white/5 text-[10px] text-slate-400 font-mono tracking-wider" data-testid={`badge-telemetry-${i}`}>
                        <span>⚡ {m.metadata.model}</span>
                        <span>⏱️ {(m.metadata.durationMs / 1000).toFixed(2)}s</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Ask for a full quiz on calculus with mixed difficulty..."
                className="glass-input flex-1 min-h-[44px] resize-none"
                data-testid="input-copilot-message"
              />
              <Button
                className="glow-button shrink-0"
                onClick={() => chatMutation.mutate(msg)}
                disabled={!msg.trim() || chatMutation.isPending}
                data-testid="button-copilot-send"
              >
                {chatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="glass-card flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <FileStack className="w-4 h-4 text-violet-400" />
            <h2 className="font-semibold text-slate-100">Draft Staging Area</h2>
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Select Quiz to Publish Into</Label>
              <select
                className="w-full glass-input h-10 px-3 rounded-lg bg-black/20 border border-white/10 text-slate-200"
                value={selectedQuizId ?? ""}
                onChange={(e) => setSelectedQuizId(Number(e.target.value) || null)}
                data-testid="select-target-quiz"
              >
                <option value="">Select quiz</option>
                {quizzes?.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            </div>
            <div className="h-[430px] overflow-auto space-y-3 pr-1">
              {drafts.length === 0 && (
                <p className="text-sm text-slate-500 text-center pt-8">No drafts yet. Use the chat to generate questions.</p>
              )}
              {drafts.map((d, idx) => (
                <div key={idx} className="border border-white/10 rounded-xl p-4 space-y-2 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-violet-400">Q{idx + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-slate-500 hover:text-red-400"
                      onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={d.prompt_text}
                    onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, prompt_text: e.target.value } : x))}
                    className="glass-input text-sm"
                    placeholder="Question text"
                    data-testid={`input-draft-prompt-${idx}`}
                  />
                  {d.prompt_text && (
                    <div className="text-sm text-slate-300 bg-white/[0.03] border border-white/5 rounded-lg p-2">
                      {renderLatex(unescapeLatex(d.prompt_text))}
                    </div>
                  )}
                  {d.options.map((o, oi) => (
                    <Input
                      key={oi}
                      value={o}
                      onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, options: x.options.map((a, j) => j === oi ? e.target.value : a) } : x))}
                      className="glass-input text-sm"
                      placeholder={`Option ${oi + 1}`}
                      data-testid={`input-draft-option-${idx}-${oi}`}
                    />
                  ))}
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
                  <Input
                    placeholder="Image URL"
                    value={d.image_url ?? ""}
                    onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, image_url: e.target.value || null } : x))}
                    className="glass-input text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <Input
                      type="file"
                      accept="image/*"
                      className="glass-input text-sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAttachImage(idx, f).catch((err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="w-full glow-button"
              size="lg"
              onClick={() => publishMutation.mutate()}
              disabled={!selectedQuizId || drafts.length === 0 || publishMutation.isPending}
              data-testid="button-publish-drafts"
            >
              {publishMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Publishing...</>
              ) : (
                "Save & Publish"
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
