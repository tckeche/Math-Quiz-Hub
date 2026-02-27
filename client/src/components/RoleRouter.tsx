import { useState, useEffect } from "react";
import { Redirect } from "wouter";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

interface RoleRouterProps {
  studentComponent: React.ComponentType<any>;
  tutorComponent: React.ComponentType<any>;
}

export default function RoleRouter({ studentComponent: StudentComp, tutorComponent: TutorComp }: RoleRouterProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/auth/me?userId=${session.user.id}`)
      .then((res) => res.json())
      .then((data) => {
        setRole(data.role || "student");
        setIsLoading(false);
      })
      .catch(() => {
        setRole("student");
        setIsLoading(false);
      });
  }, [session?.user?.id]);

  if (isLoading) {
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

  if (role === "super_admin") {
    return <Redirect to="/super-admin" />;
  }

  if (role === "tutor") {
    return <TutorComp />;
  }

  return <StudentComp />;
}
