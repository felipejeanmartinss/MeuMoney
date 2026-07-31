export default function DashboardLoading() {
  return (
    <main
      className="mx-auto grid max-w-6xl animate-pulse gap-7 px-4 py-8 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="Carregando visão financeira"
    >
      <div className="h-56 rounded-3xl bg-slate-200" />
      <div className="h-10 w-72 rounded-xl bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-32 rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
      <div className="h-52 rounded-2xl border border-slate-200 bg-white" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <span className="sr-only">Carregando indicadores financeiros…</span>
    </main>
  );
}
