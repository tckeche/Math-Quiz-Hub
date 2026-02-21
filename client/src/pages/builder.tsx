import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Quiz } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type DraftQuestion = {
  prompt_text: string;
  options: string[];
  correct_answer: string;
  marks_worth: number;
  image_url?: string | null;
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
    </div>
  );
}
