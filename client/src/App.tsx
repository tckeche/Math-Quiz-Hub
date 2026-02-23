import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import AdminPage from "@/pages/admin";
import QuizPage from "@/pages/quiz";
import BuilderPage from "@/pages/builder";
import AnalyticsPage from "@/pages/analytics";
import SomaQuizEngine from "@/pages/soma-quiz";
import { ErrorBoundary } from "@/components/error-boundary";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/portal" component={Home} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/builder/:id" component={BuilderPage} />
      <Route path="/admin/builder" component={BuilderPage} />
      <Route path="/admin/analytics/:id" component={AnalyticsPage} />
      <Route path="/quiz/:id" component={QuizPage} />
      <Route path="/soma/quiz/:id" component={SomaQuizEngine} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ErrorBoundary title="Application error"><Router /></ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
