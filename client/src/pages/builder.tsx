<<<<<<< HEAD
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
=======
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
>>>>>>> e68bba0 (Add quiz PIN verification and AI-powered quiz builder features)
import type { Quiz } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
<<<<<<< HEAD
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type DraftQuestion = {
=======
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Bot, User, Plus, Trash2, ImagePlus, Save, Loader2, ArrowLeft, MessageSquare,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DraftQuestion {
>>>>>>> e68bba0 (Add quiz PIN verification and AI-powered quiz builder features)
  prompt_text: string;
  options: string[];
  correct_answer: string;
  marks_worth: number;
  image_url?: string | null;
<<<<<<< HEAD
};

export default function BuilderPage() {
  const { toast } = useToast();
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);

  const authenticated = typeof window !== "undefined" && localStorage.getItem("admin_token") === "authenticated";

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
      setChat((prev) => [...prev, { role: "user", text: message }, { role: "ai", text: data.reply }]);
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

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card><CardContent className="py-8">Please log in via <Link href="/admin"><a className="underline">/admin</a></Link>.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>AI Co-Pilot Chat</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[520px] overflow-auto border rounded p-3 space-y-2">
            {chat.map((m, i) => <div key={i} className={m.role === "user" ? "text-right" : "text-left"}><p className="text-sm whitespace-pre-wrap">{m.text}</p></div>)}
          </div>
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask for a full quiz on calculus with mixed difficulty..." />
          <Button onClick={() => chatMutation.mutate(msg)} disabled={!msg.trim() || chatMutation.isPending}>
            {chatMutation.isPending ? "Thinking..." : "Send"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Draft Staging Area</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Select Quiz to Publish Into</Label>
            <select className="w-full border rounded h-10 px-2" value={selectedQuizId ?? ""} onChange={(e) => setSelectedQuizId(Number(e.target.value) || null)}>
              <option value="">Select quiz</option>
              {quizzes?.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
          </div>
          <div className="h-[430px] overflow-auto space-y-3">
            {drafts.map((d, idx) => (
              <div key={idx} className="border rounded p-3 space-y-2">
                <Input value={d.prompt_text} onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, prompt_text: e.target.value } : x))} />
                {d.options.map((o, oi) => (
                  <Input key={oi} value={o} onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, options: x.options.map((a, j) => j === oi ? e.target.value : a) } : x))} />
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <Input value={d.correct_answer} onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, correct_answer: e.target.value } : x))} />
                  <Input type="number" min={1} value={d.marks_worth} onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, marks_worth: Number(e.target.value) || 1 } : x))} />
                </div>
                <Input placeholder="Image URL" value={d.image_url ?? ""} onChange={(e) => setDrafts((prev) => prev.map((x, i) => i === idx ? { ...x, image_url: e.target.value || null } : x))} />
                <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachImage(idx, f).catch((err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" })); }} />
              </div>
            ))}
          </div>
          <Button onClick={() => publishMutation.mutate()} disabled={!selectedQuizId || drafts.length === 0 || publishMutation.isPending}>
            {publishMutation.isPending ? "Publishing..." : "Save & Publish"}
          </Button>
        </CardContent>
      </Card>
=======
}

function extractJsonBlocks(text: string): DraftQuestion[] {
  const regex = /```json\s*([\s\S]*?)```/g;
  const questions: DraftQuestion[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of arr) {
        if (item.prompt_text && item.options && item.correct_answer) {
          questions.push({
            prompt_text: item.prompt_text,
            options: item.options,
            correct_answer: item.correct_answer,
            marks_worth: item.marks_worth ?? 1,
            image_url: item.image_url ?? null,
          });
        }
      }
    } catch {
      // parsing failed, skip this block
    }
  }
  return questions;
}

function stripJsonBlocks(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/g, "").trim();
}

export default function BuilderPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (localStorage.getItem("admin_token") !== "authenticated") {
      navigate("/admin");
    }
  }, [navigate]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: quizzes, isLoading: quizzesLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/admin/quizzes"],
  });

  const publishMutation = useMutation({
    mutationFn: async ({ quizId, questions }: { quizId: number; questions: DraftQuestion[] }) =>
      apiRequest("POST", `/api/admin/quizzes/${quizId}/questions`, { questions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/quizzes"] });
      setDrafts([]);
      toast({ title: "Questions published successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/builder/chat", { messages: updatedMessages });
      const data = await res.json();
      const assistantContent = data.response || "";
      const assistantMsg: ChatMessage = { role: "assistant", content: assistantContent };
      setMessages((prev) => [...prev, assistantMsg]);

      const extracted = extractJsonBlocks(assistantContent);
      if (extracted.length > 0) {
        setDrafts((prev) => [...prev, ...extracted]);
      }
    } catch (err: any) {
      toast({ title: "Chat error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const updateDraft = (index: number, field: keyof DraftQuestion, value: any) => {
    setDrafts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateDraftOption = (qIndex: number, optIndex: number, value: string) => {
    setDrafts((prev) => {
      const updated = [...prev];
      const newOptions = [...updated[qIndex].options];
      newOptions[optIndex] = value;
      updated[qIndex] = { ...updated[qIndex], options: newOptions };
      return updated;
    });
  };

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageUpload = async (qIndex: number, file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/upload-image", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      updateDraft(qIndex, "image_url", data.url);
      toast({ title: "Image attached" });
    } catch {
      toast({ title: "Image upload failed", variant: "destructive" });
    }
  };

  const handlePublish = () => {
    if (!selectedQuizId || drafts.length === 0) return;
    publishMutation.mutate({ quizId: parseInt(selectedQuizId), questions: drafts });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="page-builder">
      <header className="border-b px-4 py-3 flex items-center gap-3">
        <Link href="/admin" data-testid="link-back-admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h1 className="font-serif text-lg font-semibold" data-testid="text-builder-title">AI Co-Pilot Builder</h1>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane - Chat */}
        <div className="w-1/2 border-r flex flex-col" data-testid="pane-chat">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground" data-testid="text-chat-empty">
                <Bot className="w-12 h-12 mb-3 opacity-40" />
                <p className="font-serif text-lg font-medium mb-1">Start a conversation</p>
                <p className="text-sm max-w-xs">
                  Ask the AI to generate quiz questions. It will respond with editable drafts in the staging area.
                </p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`message-${msg.role}-${idx}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-md px-4 py-3 max-w-[80%] text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {msg.role === "assistant" ? stripJsonBlocks(msg.content) || msg.content : msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3" data-testid="chat-loading">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted rounded-md px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask AI to generate quiz questions..."
                className="resize-none min-h-[44px] max-h-[120px] text-sm"
                rows={1}
                data-testid="input-chat-message"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                size="icon"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Pane - Staging Area */}
        <div className="w-1/2 flex flex-col overflow-hidden" data-testid="pane-staging">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-serif text-base font-semibold" data-testid="text-staging-title">
                Staging Area
              </h2>
              <Badge variant="secondary" data-testid="badge-draft-count">
                {drafts.length} draft{drafts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                {quizzesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={selectedQuizId} onValueChange={setSelectedQuizId} data-testid="select-quiz">
                    <SelectTrigger data-testid="select-quiz-trigger">
                      <SelectValue placeholder="Select a quiz to publish to" />
                    </SelectTrigger>
                    <SelectContent>
                      {quizzes?.map((q) => (
                        <SelectItem key={q.id} value={String(q.id)} data-testid={`select-quiz-option-${q.id}`}>
                          {q.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                onClick={handlePublish}
                disabled={!selectedQuizId || drafts.length === 0 || publishMutation.isPending}
                data-testid="button-publish"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1.5" />
                )}
                {publishMutation.isPending ? "Publishing..." : "Save & Publish"}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {drafts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground" data-testid="text-staging-empty">
                <Plus className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">
                  Questions generated by AI will appear here as editable drafts.
                </p>
              </div>
            )}
            {drafts.map((q, idx) => (
              <Card key={idx} data-testid={`card-draft-${idx}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <CardTitle className="text-sm font-mono">Q{idx + 1}</CardTitle>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => removeDraft(idx)}
                    data-testid={`button-remove-draft-${idx}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Question Text</Label>
                    <Textarea
                      value={q.prompt_text}
                      onChange={(e) => updateDraft(idx, "prompt_text", e.target.value)}
                      className="font-mono text-sm min-h-[60px]"
                      data-testid={`input-draft-prompt-${idx}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Option {String.fromCharCode(65 + optIdx)}</Label>
                        <Input
                          value={opt}
                          onChange={(e) => updateDraftOption(idx, optIdx, e.target.value)}
                          className="font-mono text-sm"
                          data-testid={`input-draft-opt-${idx}-${optIdx}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Correct Answer</Label>
                      <Input
                        value={q.correct_answer}
                        onChange={(e) => updateDraft(idx, "correct_answer", e.target.value)}
                        className="font-mono text-sm"
                        data-testid={`input-draft-answer-${idx}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Marks</Label>
                      <Input
                        type="number"
                        min="1"
                        value={q.marks_worth}
                        onChange={(e) => updateDraft(idx, "marks_worth", parseInt(e.target.value) || 1)}
                        className="font-mono text-sm"
                        data-testid={`input-draft-marks-${idx}`}
                      />
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-3 flex-wrap">
                    <Label htmlFor={`draft-img-${idx}`} className="cursor-pointer">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground border rounded-md px-3 py-1.5">
                        <ImagePlus className="w-4 h-4" />
                        {q.image_url ? "Change Image" : "Attach Image"}
                      </div>
                      <input
                        id={`draft-img-${idx}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleImageUpload(idx, e.target.files[0]);
                        }}
                        data-testid={`input-draft-image-${idx}`}
                      />
                    </Label>
                    {q.image_url && (
                      <div className="flex items-center gap-2">
                        <img src={q.image_url} alt="attached" className="h-10 w-10 object-cover rounded-md border" />
                        <Button variant="outline" size="sm" onClick={() => updateDraft(idx, "image_url", null)} data-testid={`button-remove-image-${idx}`}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
>>>>>>> e68bba0 (Add quiz PIN verification and AI-powered quiz builder features)
    </div>
  );
}
