export default function NetWorthLoading() {
  return (
    <main
      className="mx-auto grid max-w-6xl animate-pulse gap-7 px-4 py-8 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="Carregando patrimônio"
    >
      <div className="h-32 rounded-3xl bg-slate-200" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-48 rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-64 rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
      <span className="sr-only">Carregando informações patrimoniais…</span>
    </main>
  );
}
