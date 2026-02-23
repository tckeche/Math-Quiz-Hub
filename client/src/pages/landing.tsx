import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center px-4 bg-[#0A0F1C] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(139,92,246,0.25),rgba(10,15,28,1))]">
      <div className="text-center z-10 relative">
        <img src="/MCEC - White Logo.png" alt="MCEC Logo" className="h-20 w-auto object-contain mx-auto mb-8" />

        <h1 className="text-4xl md:text-6xl font-black text-[#DDD6FE] drop-shadow-[0_0_20px_rgba(139,92,246,0.3)] tracking-tight mb-4" data-testid="text-main-title">
          Welcome to SOMA
        </h1>

        <p className="text-sm md:text-lg font-light tracking-[0.2em] text-slate-400 uppercase mb-1" data-testid="text-subtitle">
          An Intelligent Assessment Platform
        </p>

        <p className="text-sm md:text-base font-light tracking-[0.2em] text-slate-500 uppercase" data-testid="text-byline">
          by MCEC
        </p>

        <Link href="/portal">
          <button
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:shadow-[0_0_20px_rgba(139,92,246,0.6)] text-white font-medium rounded-full px-8 py-4 mt-10 transition-all block w-fit mx-auto cursor-pointer"
            data-testid="button-enter-portal"
          >
            Enter Student Portal
          </button>
        </Link>

        <Link href="/admin">
          <span
            className="text-xs text-slate-500 hover:text-violet-400 mt-6 tracking-widest uppercase transition-colors block mx-auto cursor-pointer"
            data-testid="link-admin-access"
          >
            Admin Access
          </span>
        </Link>
      </div>
    </div>
  );
}
