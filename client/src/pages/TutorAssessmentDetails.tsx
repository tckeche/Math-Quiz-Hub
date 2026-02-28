import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import type { SomaQuiz } from "@shared/schema";
import {
  ArrowLeft, BookOpen, Users, Trash2, Plus, FileText,
  Loader2, Check, X, MoreVertical, Archive, ArchiveX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StudentAssignment {
  assignmentId: number;
  studentId: string;
  studentName: string;
  studentEmail: string;
  assignmentStatus: string;
  status: "Not Started" | "In Progress" | "Submitted" | "Failed";
  startTime: string | null;
  submissionTime: string | null;
  finalGrade: number | null;
  maxGrade: number;
  reportId: number | null;
}

interface QuizDetails {
  quiz: SomaQuiz;
  assignments: StudentAssignment[];
  totalAssigned: number;
  totalSubmitted: number;
}

const CARD_CLASS = "bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl";

function getStatusColor(status: StudentAssignment["status"]) {
  switch (status) {
    case "Submitted":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    case "In Progress":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "Failed":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-slate-500/10 text-slate-400 border-slate-500/30";
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TutorAssessmentDetails() {
  const queryClient = useQueryClient();
  const params = useParams<{ quizId: string }>();
  const [, setLocation] = useLocation();
  const quizId = parseInt(params.quizId || "0");
  const [session, setSession] = useState<any>(null);
  const [revokeStudentId, setRevokeStudentId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
  }, []);

  const userId = session?.user?.id;
  const headers = useMemo(() => ({ "x-tutor-id": userId || "" }), [userId]);

  const { data: details, isLoading } = useQuery<QuizDetails>({
    queryKey: [`/api/tutor/quizzes/${quizId}/details`, userId],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const res = await fetch(`/api/tutor/quizzes/${quizId}/details`, { headers });
      if (!res.ok) throw new Error("Failed to load details");
      return res.json();
    },
    enabled: !!userId && quizId > 0,
  });

  // Revoke assignment mutation
  const revokeMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await fetch(`/api/tutor/quizzes/${quizId}/assignments/${studentId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to revoke");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tutor/quizzes/${quizId}/details`] });
      setRevokeStudentId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </Link>
          <div className={`${CARD_CLASS} text-center py-12`}>
            <p className="text-slate-400">Quiz not found</p>
          </div>
        </div>
      </div>
    );
  }

  const { quiz, assignments } = details;
  const submittedCount = assignments.filter((a) => a.status === "Submitted").length;
  const avgGrade = assignments
    .filter((a) => a.finalGrade !== null)
    .reduce((sum, a) => sum + (a.finalGrade || 0), 0) / Math.max(submittedCount, 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
          </Link>
        </div>

        {/* Quiz Title & Stats */}
        <div className={CARD_CLASS}>
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">{quiz.title}</h1>
                <p className="text-sm text-slate-400">{quiz.topic}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-slate-800 border-slate-700">
                <DropdownMenuItem className="text-slate-300 cursor-pointer">
                  {quiz.isArchived ? (
                    <>
                      <ArchiveX className="w-4 h-4 mr-2" />
                      Unarchive Quiz
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 mr-2" />
                      Archive Quiz
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-2xl font-bold text-slate-200">{quiz.level}</p>
              <p className="text-xs text-slate-400 mt-1">Level</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-2xl font-bold text-violet-300">{details.totalAssigned}</p>
              <p className="text-xs text-slate-400 mt-1">Total Assigned</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-2xl font-bold text-emerald-300">{submittedCount}</p>
              <p className="text-xs text-slate-400 mt-1">Submitted</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-2xl font-bold text-cyan-300">{submittedCount > 0 ? avgGrade.toFixed(1) : "—"}</p>
              <p className="text-xs text-slate-400 mt-1">Avg Grade</p>
            </div>
          </div>
        </div>

        {/* Student Assignments Table */}
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Student Progress
            </h2>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/40 hover:bg-violet-500/30 transition-all text-sm font-medium">
              <Plus className="w-4 h-4" />
              Add More Students
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Start Time
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No students assigned to this quiz yet
                    </td>
                  </tr>
                ) : (
                  assignments.map((assignment) => (
                    <tr key={assignment.studentId} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-medium text-slate-200">{assignment.studentName}</p>
                          <p className="text-xs text-slate-400">{assignment.studentEmail}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <Badge className={`text-xs border ${getStatusColor(assignment.status)}`}>
                          {assignment.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-sm text-slate-300">
                        {formatDate(assignment.startTime)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {assignment.finalGrade !== null ? (
                          <div>
                            <p className="font-semibold text-slate-200">
                              {assignment.finalGrade}/{assignment.maxGrade}
                            </p>
                            <p className="text-xs text-slate-400">
                              {((assignment.finalGrade / assignment.maxGrade) * 100).toFixed(0)}%
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-2">
                          {assignment.reportId && assignment.status === "Submitted" && (
                            <Link href={`/soma/review/${assignment.reportId}`}>
                              <button
                                className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
                                title="View AI analysis"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            </Link>
                          )}
                          <button
                            onClick={() => setRevokeStudentId(assignment.studentId)}
                            className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Revoke assignment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeStudentId !== null}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-300">Revoke Assignment</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove the student's access to this quiz. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeStudentId) revokeMutation.mutate(revokeStudentId);
              }}
              disabled={revokeMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {revokeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Revoke"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
