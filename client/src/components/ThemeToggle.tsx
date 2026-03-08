import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  return (
    <Button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="fixed top-4 right-4 z-[60] min-h-[44px] px-4 py-2 rounded-xl border border-violet-500/30 bg-white/10 backdrop-blur-md text-slate-100 hover:bg-white/20"
      data-testid="button-theme-toggle"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
      {isDark ? "Light Mode" : "Dark Mode"}
    </Button>
  );
}
