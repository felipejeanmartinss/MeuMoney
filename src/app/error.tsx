"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-content-center gap-5 px-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-red-700">
        Não foi possível carregar
      </p>
      <h1 className="text-3xl font-extrabold">Algo saiu do esperado</h1>
      <p className="text-slate-600">
        Seus dados não foram alterados. Tente novamente ou volte ao início.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          onClick={reset}
          className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white"
        >
          Tentar novamente
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-300 px-5 py-3 font-semibold"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
