"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-red-700">
          Visão temporariamente indisponível
        </p>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950">
          Não foi possível carregar o dashboard
        </h1>
        <p className="mx-auto mt-3 max-w-xl leading-6 text-slate-600">
          Tente novamente. Se o problema continuar, confirme se a migration da
          Sprint 7 foi aplicada ao Supabase deste ambiente.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
