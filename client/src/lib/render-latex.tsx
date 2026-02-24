import { BlockMath, InlineMath } from 'react-katex';

/**
 * Shared LaTeX rendering utility used across all pages.
 * Handles: Unicode math symbols, code blocks, delimited LaTeX,
 * and auto-detection of undelimited LaTeX commands.
 */

const UNICODE_MAP: [RegExp, string][] = [
  [/±/g, '\\pm '],
  [/×/g, '\\times '],
  [/÷/g, '\\div '],
  [/≤/g, '\\leq '],
  [/≥/g, '\\geq '],
  [/≠/g, '\\neq '],
  [/√/g, '\\sqrt{}'],
  [/π/g, '\\pi '],
  [/θ/g, '\\theta '],
  [/α/g, '\\alpha '],
  [/β/g, '\\beta '],
  [/γ/g, '\\gamma '],
  [/δ/g, '\\delta '],
  [/λ/g, '\\lambda '],
  [/μ/g, '\\mu '],
  [/σ/g, '\\sigma '],
  [/ω/g, '\\omega '],
  [/∞/g, '\\infty '],
  [/∑/g, '\\sum '],
  [/∫/g, '\\int '],
  [/→/g, '\\rightarrow '],
  [/⁻/g, '^{-}'],
  [/²/g, '^{2}'],
  [/³/g, '^{3}'],
  [/¹/g, '^{1}'],
  [/⁰/g, '^{0}'],
];

// Regex to detect undelimited LaTeX commands in plain text
const LATEX_CMD_RE = /(?:\\frac\{[^}]*\}\{[^}]*\}|\\sqrt(?:\[[^\]]*\])?\{[^}]*\}|\\(?:sum|prod|int|lim|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan)(?:\b|[_^{]))[^\\]*/g;

/**
 * Auto-wraps undelimited LaTeX commands found in plain text segments.
 * E.g. "s = ut + \frac{1}{2}at^2" → "s = ut + \(\frac{1}{2}at^2\)"
 */
function autoWrapLatex(text: string): string {
  // Don't process if already has delimiters
  if (/\\\(|\\\[|\$/.test(text)) return text;
  // If it contains known LaTeX commands, wrap the whole thing
  if (/\\(?:frac|sqrt|sum|prod|int|lim|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|pm|times|div|leq|geq|neq|infty|rightarrow|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega)\b/.test(text)) {
    return `\\(${text}\\)`;
  }
  return text;
}

export function unescapeLatex(str: string): string {
  return str.replace(/\\\\/g, '\\');
}

export function renderLatex(text: string) {
  if (!text) return null;

  // Pre-process: normalize Unicode math symbols to LaTeX
  let processed = text;
  for (const [pattern, replacement] of UNICODE_MAP) {
    processed = processed.replace(pattern, replacement);
  }

  // Auto-wrap undelimited LaTeX in plain text segments
  // First check if the text has any delimiters at all
  const hasDelimiters = /\\\(|\\\)|\\\[|\\\]|\$\$|\$/.test(processed);
  if (!hasDelimiters) {
    processed = autoWrapLatex(processed);
  }

  // Split on code blocks first, then LaTeX delimiters
  const codeBlockRegex = /(```[\s\S]*?```|`[^`]+`)/g;
  const codeSegments = processed.split(codeBlockRegex);

  return codeSegments.map((segment, si) => {
    // Render code blocks with monospace styling
    if (segment.startsWith('```') && segment.endsWith('```')) {
      const code = segment.slice(3, -3).replace(/^\w+\n/, '');
      return <pre key={si} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3 my-2 text-sm font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap">{code}</pre>;
    }
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
      return <code key={si} className="bg-slate-800/50 border border-slate-700/40 rounded px-1.5 py-0.5 text-sm font-mono text-cyan-300">{segment.slice(1, -1)}</code>;
    }

    // Handle LaTeX delimiters within non-code segments
    const parts = segment.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);
    return parts.map((part, i) => {
      const key = `${si}-${i}`;
      if (part.startsWith('\\(') && part.endsWith('\\)')) {
        try { return <InlineMath key={key} math={part.slice(2, -2)} />; } catch { return <span key={key}>{part}</span>; }
      }
      if (part.startsWith('\\[') && part.endsWith('\\]')) {
        try { return <BlockMath key={key} math={part.slice(2, -2)} />; } catch { return <span key={key}>{part}</span>; }
      }
      if (part.startsWith('$$') && part.endsWith('$$')) {
        try { return <BlockMath key={key} math={part.slice(2, -2)} />; } catch { return <span key={key}>{part}</span>; }
      }
      if (part.startsWith('$') && part.endsWith('$') && part.length > 1) {
        try { return <InlineMath key={key} math={part.slice(1, -1)} />; } catch { return <span key={key}>{part}</span>; }
      }
      return <span key={key}>{part}</span>;
    });
  });
}
