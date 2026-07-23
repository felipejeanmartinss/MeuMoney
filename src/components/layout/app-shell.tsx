import Link from "next/link";
import { logout } from "@/app/actions/auth";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const navigation = [
    { href: "/dashboard", label: "Início" },
    { href: "/accounts", label: "Contas" },
    { href: "/categories", label: "Categorias" },
    { href: "/settings/profile", label: "Perfil" },
  ];

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex min-h-16 items-center justify-between gap-4">
            <Link
              href="/dashboard"
              className="text-xl font-extrabold tracking-tight text-blue-800"
            >
              MeuMoney
            </Link>
            <form action={logout}>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Sair
              </button>
            </form>
          </div>
          <nav
            aria-label="Navegação principal"
            className="-mx-1 grid grid-cols-4 gap-1 border-t border-slate-100 py-2 sm:flex sm:border-0 sm:py-0"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="min-w-0 rounded-lg px-1.5 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:px-3 sm:text-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
