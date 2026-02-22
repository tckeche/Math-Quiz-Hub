import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("UI runtime error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive/60 mb-3" />
              <h2 className="font-serif text-xl font-bold">{this.props.title || "Something went wrong"}</h2>
              <p className="text-sm text-muted-foreground mt-2">Please refresh the page and try again.</p>
              <Link href="/">
                <Button variant="outline" className="mt-4">
                  <Home className="w-4 h-4 mr-1.5" />
                  Return Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
