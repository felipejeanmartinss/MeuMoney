export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="mx-auto grid min-h-[50vh] max-w-6xl place-content-center px-6 text-slate-600"
    >
      Carregando…
    </main>
  );
}
