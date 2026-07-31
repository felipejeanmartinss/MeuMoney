import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-5 px-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">
        404
      </p>
      <h1 className="text-3xl font-extrabold">Página não encontrada</h1>
      <p className="text-slate-600">
        O endereço pode ter mudado ou não estar disponível.
      </p>
      <Link
        href="/dashboard"
        className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
