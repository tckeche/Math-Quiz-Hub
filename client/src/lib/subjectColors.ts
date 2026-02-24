function hashString(str: string): number {
  let hash = 5381;
  const normalized = str.toLowerCase().trim();
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const TW_BG_CLASSES = [
  "bg-emerald-500/15", "bg-blue-500/15", "bg-amber-500/15", "bg-rose-500/15",
  "bg-pink-500/15", "bg-orange-500/15", "bg-cyan-500/15", "bg-teal-500/15",
  "bg-indigo-500/15", "bg-lime-500/15", "bg-violet-400/15", "bg-fuchsia-400/15",
  "bg-yellow-400/15", "bg-sky-400/15", "bg-green-400/15", "bg-red-400/15",
];

const TW_LABEL_CLASSES = [
  "text-emerald-400", "text-blue-400", "text-amber-400", "text-rose-400",
  "text-pink-400", "text-orange-400", "text-cyan-400", "text-teal-400",
  "text-indigo-400", "text-lime-400", "text-violet-400", "text-fuchsia-400",
  "text-yellow-400", "text-sky-400", "text-green-400", "text-red-400",
];

const TW_BORDER_CLASSES = [
  "border-emerald-500/30", "border-blue-500/30", "border-amber-500/30", "border-rose-500/30",
  "border-pink-500/30", "border-orange-500/30", "border-cyan-500/30", "border-teal-500/30",
  "border-indigo-500/30", "border-lime-500/30", "border-violet-400/30", "border-fuchsia-400/30",
  "border-yellow-400/30", "border-sky-400/30", "border-green-400/30", "border-red-400/30",
];

const TW_RING_CLASSES = [
  "ring-emerald-500", "ring-blue-500", "ring-amber-500", "ring-rose-500",
  "ring-pink-500", "ring-orange-500", "ring-cyan-500", "ring-teal-500",
  "ring-indigo-500", "ring-lime-500", "ring-violet-400", "ring-fuchsia-400",
  "ring-yellow-400", "ring-sky-400", "ring-green-400", "ring-red-400",
];

interface SubjectColor {
  hex: string;
  bg: string;
  border: string;
  ring: string;
  label: string;
}

const colorCache = new Map<string, SubjectColor>();

export function getSubjectColor(subject: string | null | undefined): SubjectColor {
  if (!subject) return { hex: "#a78bfa", bg: "bg-violet-400/15", border: "border-violet-400/30", ring: "ring-violet-400", label: "text-violet-400" };

  const key = subject.toLowerCase().trim();
  if (colorCache.has(key)) return colorCache.get(key)!;

  const hash = hashString(key);
  const hue = hash % 360;
  const hex = hslToHex(hue, 80, 60);

  const twIdx = hash % TW_BG_CLASSES.length;

  const color: SubjectColor = {
    hex,
    bg: TW_BG_CLASSES[twIdx],
    border: TW_BORDER_CLASSES[twIdx],
    ring: TW_RING_CLASSES[twIdx],
    label: TW_LABEL_CLASSES[twIdx],
  };

  colorCache.set(key, color);
  return color;
}
