import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Quiz } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Calendar, ArrowRight, GraduationCap, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export default function Home() {
  const { data: quizzes, isLoading } = useQuery<Quiz[]>({
    queryKey: ["/api/quizzes"],
  });

  const now = new Date();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold tracking-tight" data-testid="text-site-title">
                  Mathematics Assessment Portal
                </h1>
                <p className="text-sm text-muted-foreground">Select an examination to begin</p>
              </div>
            </div>
            <Link href="/admin">
              <Button variant="outline" size="sm" data-testid="link-admin">
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Admin
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !quizzes || quizzes.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <h2 className="text-xl font-serif font-semibold text-muted-foreground mb-2">No Examinations Available</h2>
            <p className="text-sm text-muted-foreground">Check back later for upcoming assessments.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {quizzes.map((quiz) => {
              const isClosed = new Date(quiz.dueDate) < now;
              return (
                <Card key={quiz.id} className={isClosed ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-serif text-lg leading-snug" data-testid={`text-quiz-title-${quiz.id}`}>
                        {quiz.title}
                      </CardTitle>
                      <Badge variant={isClosed ? "secondary" : "default"} data-testid={`badge-quiz-status-${quiz.id}`}>
                        {isClosed ? "Closed" : "Open"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{quiz.timeLimitMinutes} minutes</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>Due: {format(new Date(quiz.dueDate), "PPP 'at' p")}</span>
                      </div>
                    </div>
                    {!isClosed && (
                      <Link href={`/quiz/${quiz.id}`}>
                        <Button className="w-full" data-testid={`button-start-quiz-${quiz.id}`}>
                          Start Examination
                          <ArrowRight className="w-4 h-4 ml-1.5" />
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
