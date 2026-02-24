import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Send, Loader2 } from "lucide-react";

export default function SomaChat() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setReply(null);
    try {
      const res = await fetch("/api/soma/global-tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      setReply(data.reply || data.message);
    } catch {
      setReply("Failed to reach the AI Tutor. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200" data-testid="button-chat-back">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Dashboard
            </Button>
          </Link>
        </div>

        <div className="glass-card p-8 text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5 border border-emerald-500/30">
            <Sparkles className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-2" data-testid="text-chat-title">Global AI Tutor</h1>
          <p className="text-sm text-slate-400">Ask any math question and get instant help</p>
        </div>

        <div className="glass-card p-6">
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask a math question..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40"
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSend}
              disabled={loading || !message.trim()}
              className="glow-button px-4"
              data-testid="button-chat-send"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          {reply && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="text-chat-reply">
              <p className="text-sm text-slate-300 leading-relaxed">{reply}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
