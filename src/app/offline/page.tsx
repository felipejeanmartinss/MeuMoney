import Link from "next/link";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-5 px-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
        Sem conexão
      </p>
      <h1 className="text-3xl font-extrabold">O MeuMoney está offline</h1>
      <p className="text-slate-600">
        Por segurança, dados financeiros não ficam armazenados no cache.
        Reconecte-se para continuar.
      </p>
      <Link
        href="/dashboard"
        className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white"
      >
        Tentar novamente
      </Link>
    </main>
  );
}
