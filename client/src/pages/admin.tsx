import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Quiz, Question, Submission, Student } from "@shared/schema";
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
  BookOpen, Clock, Calendar, Users, CheckCircle2, AlertCircle, LogOut
} from "lucide-react";
import { format } from "date-fns";

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "Chomukamba") {
      localStorage.setItem("admin_token", "authenticated");
      onLogin();
    } else {
      setError("Incorrect password. Access denied.");
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
            <Button type="submit" className="w-full" data-testid="button-admin-login">
              Sign In
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
      const parsed = JSON.parse(text);
      const questions = Array.isArray(parsed) ? parsed : [parsed];
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
          Upload Questions
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

function QuizDetail({ quizId, onBack }: { quizId: number; onBack: () => void }) {
  const [showUploader, setShowUploader] = useState(false);
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
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-xl font-bold truncate" data-testid="text-quiz-detail-title">{quiz.title}</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{quiz.timeLimitMinutes} min</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Due {format(new Date(quiz.dueDate), "PPP")}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setShowUploader(!showUploader)} data-testid="button-toggle-uploader">
          <Upload className="w-4 h-4 mr-1" />
          Add Questions
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowResults(!showResults)} data-testid="button-toggle-results">
          <Users className="w-4 h-4 mr-1" />
          View Results ({submissions?.length ?? 0})
        </Button>
        {submissions && submissions.length > 0 && (
          <Button variant="outline" size="sm" onClick={downloadCSV} data-testid="button-download-csv">
            <Download className="w-4 h-4 mr-1" />
            Download CSV
          </Button>
        )}
      </div>

      {showUploader && (
        <QuestionUploader quizId={quizId} onDone={() => setShowUploader(false)} />
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Student</th>
                      <th className="text-center py-2 px-3 font-medium">Score</th>
                      <th className="text-center py-2 px-3 font-medium">%</th>
                      <th className="text-right py-2 px-3 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.id} className="border-b last:border-0" data-testid={`row-submission-${s.id}`}>
                        <td className="py-2 px-3">{s.student.firstName} {s.student.lastName}</td>
                        <td className="text-center py-2 px-3 font-medium">{s.totalScore}/{s.maxPossibleScore}</td>
                        <td className="text-center py-2 px-3">
                          <Badge variant={s.totalScore / s.maxPossibleScore >= 0.5 ? "default" : "secondary"}>
                            {((s.totalScore / s.maxPossibleScore) * 100).toFixed(0)}%
                          </Badge>
                        </td>
                        <td className="text-right py-2 px-3 text-muted-foreground">{format(new Date(s.submittedAt), "PP p")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <p className="text-sm">No questions added yet. Upload a JSON file to get started.</p>
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
  const [authenticated, setAuthenticated] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);

  useEffect(() => {
    if (localStorage.getItem("admin_token") === "authenticated") {
      setAuthenticated(true);
    }
  }, []);

  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/admin/quizzes"],
    enabled: authenticated,
  });

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
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
          <QuizDetail quizId={selectedQuizId} onBack={() => setSelectedQuizId(null)} />
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

            {isLoading ? (
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
