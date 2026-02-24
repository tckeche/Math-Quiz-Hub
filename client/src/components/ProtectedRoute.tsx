import { useState, useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  component: React.ComponentType<any>;
}

export default function ProtectedRoute({ component: Component, ...rest }: ProtectedRouteProps & Record<string, any>) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Redirect to="/login" />;
  }

  return <Component {...rest} />;
}
