import Link from "next/link";
import { logout } from "@/app/actions/auth";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-dvh bg-slate-50">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-xl font-extrabold tracking-tight text-blue-800">MeuMoney</Link>
        <nav aria-label="Navegação principal" className="flex items-center gap-2 sm:gap-4">
          <Link href="/dashboard" className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Início</Link>
          <Link href="/settings/profile" className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Perfil</Link>
          <form action={logout}><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sair</button></form>
        </nav>
      </div>
    </header>
    {children}
  </div>;
}
