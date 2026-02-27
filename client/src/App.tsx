import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";

import AdminPage from "@/pages/admin";
import QuizPage from "@/pages/quiz";
import BuilderPage from "@/pages/builder";
import AnalyticsPage from "@/pages/analytics";
import SomaQuizEngine from "@/pages/soma-quiz";
import SomaQuizReview from "@/pages/SomaQuizReview";
import SomaChat from "@/pages/SomaChat";
import StudentAuth from "@/pages/StudentAuth";
import StudentDashboard from "@/pages/StudentDashboard";
import TutorDashboard from "@/pages/TutorDashboard";
import TutorStudents from "@/pages/TutorStudents";
import TutorStudentDetail from "@/pages/TutorStudentDetail";
import TutorAssessments from "@/pages/TutorAssessments";
import SomaChatPage from "@/pages/soma-chat";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleRouter from "@/components/RoleRouter";
import { ErrorBoundary } from "@/components/error-boundary";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={StudentAuth} />
      <Route path="/portal">{() => <RoleRouter studentComponent={StudentDashboard} tutorComponent={TutorDashboard} />}</Route>
      <Route path="/tutor">{() => <ProtectedRoute component={TutorDashboard} />}</Route>
      <Route path="/tutor/students/:id">{(params) => <ProtectedRoute component={TutorStudentDetail} params={params} />}</Route>
      <Route path="/tutor/students">{() => <ProtectedRoute component={TutorStudents} />}</Route>
      <Route path="/tutor/assessments">{() => <ProtectedRoute component={TutorAssessments} />}</Route>
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/builder/:id" component={BuilderPage} />
      <Route path="/admin/builder" component={BuilderPage} />
      <Route path="/admin/analytics/:id" component={AnalyticsPage} />
      <Route path="/quiz/:id">{(params) => <ProtectedRoute component={QuizPage} params={params} />}</Route>
      <Route path="/soma/quiz/:id">{(params) => <ProtectedRoute component={SomaQuizEngine} params={params} />}</Route>
      <Route path="/soma/review/:reportId">{(params) => <ProtectedRoute component={SomaQuizReview} params={params} />}</Route>
      <Route path="/soma/chat">{() => <ProtectedRoute component={SomaChatPage} />}</Route>
      <Route path="/dashboard">{() => <RoleRouter studentComponent={StudentDashboard} tutorComponent={TutorDashboard} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <ErrorBoundary title="Application error"><Router /></ErrorBoundary>
    </TooltipProvider>
  );
}

export default App;
