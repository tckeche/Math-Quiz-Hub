import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AdminPage from "@/pages/admin";
import QuizPage from "@/pages/quiz";
import BuilderPage from "@/pages/builder";
import AnalyticsPage from "@/pages/analytics";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/builder" component={BuilderPage} />
<<<<<<< HEAD
      <Route path="/admin/analytics/:id" component={AnalyticsPage} />
=======
      <Route path="/admin/analytics/:quizId" component={AnalyticsPage} />
>>>>>>> e68bba0 (Add quiz PIN verification and AI-powered quiz builder features)
      <Route path="/quiz/:id" component={QuizPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
