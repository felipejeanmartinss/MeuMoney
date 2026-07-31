import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import {
  DesktopNavigation,
  MobileBottomNavigation,
  MobileSecondaryMenu,
} from "./app-navigation";

export function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[70] -translate-y-24 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white shadow-xl focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-xl px-2 py-1 text-xl font-black tracking-tight text-emerald-950"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-800 text-sm font-black text-white shadow-sm">
            M
          </span>
          MeuMoney
        </Link>
        <div className="mt-7 min-h-0 flex-1 overflow-y-auto pr-1">
          <Suspense
            fallback={
              <div className="h-80 animate-pulse rounded-2xl bg-slate-50" />
            }
          >
            <DesktopNavigation />
          </Suspense>
        </div>
        <form action={logout} className="mt-5 border-t border-slate-100 pt-4">
          <button className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950">
            Sair com segurança
          </button>
        </form>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-lg font-black tracking-tight text-emerald-950"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-800 text-xs font-black text-white">
              M
            </span>
            MeuMoney
          </Link>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <MobileSecondaryMenu />
            </Suspense>
            <form action={logout}>
              <button
                className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600"
                aria-label="Sair da conta"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div
        id="main-content"
        tabIndex={-1}
        className="min-w-0 pb-24 lg:pl-64 lg:pb-0"
      >
        {children}
      </div>

      <Suspense fallback={null}>
        <MobileBottomNavigation />
      </Suspense>
    </div>
  );
}
