import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 relative flex items-center justify-center px-4 py-10 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#38bdf833_0,_transparent_55%),radial-gradient(circle_at_bottom,_#6366f133_0,_transparent_55%)]" />

      <main className="relative z-10 w-full max-w-xl rounded-3xl border border-slate-800/80 bg-slate-900/80 px-8 py-9 shadow-[0_24px_80px_rgba(15,23,42,0.9)] backdrop-blur-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-sky-500 text-slate-950 font-black shadow-lg shadow-sky-900/60 text-lg tracking-[0.12em]">
            IB
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">IB Automation</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.17em] text-slate-400">
              MT5 • Reports • Workflows
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-50">
            Welcome to IB Automation
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">
            Login to start managing MT5 reports, IB performance, and client automation from a single
            secure dashboard.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-sky-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-900/60 transition hover:from-sky-300 hover:to-sky-400 hover:-translate-y-0.5 active:translate-y-0"
          >
            Login to start
          </Link>

          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/60 px-6 py-2.5 text-sm font-semibold text-slate-100 shadow-sm shadow-slate-900/40 transition hover:border-slate-300 hover:bg-slate-800/80 hover:-translate-y-0.5 active:translate-y-0"
          >
            Register
          </Link>
        </div>
      </main>
    </div>
  );
}
