export default function ImportsLoading() {
  return (
    <main
      className="mx-auto grid max-w-6xl animate-pulse gap-6 px-4 py-8 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="Carregando importações"
    >
      <div className="h-28 rounded-3xl bg-slate-200" />
      <div className="h-32 rounded-3xl bg-white" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 rounded-2xl bg-white" />
        <div className="h-64 rounded-2xl bg-white" />
      </div>
    </main>
  );
}
