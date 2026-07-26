"use client";

type FinancialRouteErrorProps = {
  title: string;
  description: string;
  reset: () => void;
};

export function FinancialRouteError({
  title,
  description,
  reset,
}: FinancialRouteErrorProps) {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-4 py-12">
      <section className="w-full rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-widest text-red-700">
          Não foi possível carregar
        </p>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-950 sm:text-3xl">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">{description}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
