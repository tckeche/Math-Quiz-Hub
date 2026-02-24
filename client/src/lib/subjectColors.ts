export const subjectColorMap: Record<string, { hex: string; bg: string; border: string; ring: string; label: string }> = {
  Mathematics: { hex: "#3B82F6", bg: "bg-blue-500/10", border: "border-blue-500/30", ring: "ring-blue-500", label: "text-blue-400" },
  Math: { hex: "#3B82F6", bg: "bg-blue-500/10", border: "border-blue-500/30", ring: "ring-blue-500", label: "text-blue-400" },
  Physics: { hex: "#8B5CF6", bg: "bg-violet-500/10", border: "border-violet-500/30", ring: "ring-violet-500", label: "text-violet-400" },
  Chemistry: { hex: "#F59E0B", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "ring-amber-500", label: "text-amber-400" },
  Biology: { hex: "#10B981", bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "ring-emerald-500", label: "text-emerald-400" },
  English: { hex: "#EC4899", bg: "bg-pink-500/10", border: "border-pink-500/30", ring: "ring-pink-500", label: "text-pink-400" },
  History: { hex: "#F97316", bg: "bg-orange-500/10", border: "border-orange-500/30", ring: "ring-orange-500", label: "text-orange-400" },
  Geography: { hex: "#06B6D4", bg: "bg-cyan-500/10", border: "border-cyan-500/30", ring: "ring-cyan-500", label: "text-cyan-400" },
  Science: { hex: "#14B8A6", bg: "bg-teal-500/10", border: "border-teal-500/30", ring: "ring-teal-500", label: "text-teal-400" },
  Computing: { hex: "#6366F1", bg: "bg-indigo-500/10", border: "border-indigo-500/30", ring: "ring-indigo-500", label: "text-indigo-400" },
  Economics: { hex: "#84CC16", bg: "bg-lime-500/10", border: "border-lime-500/30", ring: "ring-lime-500", label: "text-lime-400" },
};

const defaultColor = { hex: "#A78BFA", bg: "bg-violet-400/10", border: "border-violet-400/30", ring: "ring-violet-400", label: "text-violet-300" };

export function getSubjectColor(subject: string | null | undefined) {
  if (!subject) return defaultColor;
  return subjectColorMap[subject] || subjectColorMap[subject.charAt(0).toUpperCase() + subject.slice(1)] || defaultColor;
}
