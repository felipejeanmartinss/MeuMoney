import Link from "next/link";

export function PageHeader({ title, description, actions, back }: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="grid min-w-0 gap-3">
      {back ? <Link href={back.href} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-800"><span aria-hidden="true">←</span>{back.label}</Link> : null}
      <div className="flex min-w-0 flex-col flex-wrap gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function PageHelp({ children, title = "Como funciona" }: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium text-slate-700">{title}<span aria-hidden="true">⌄</span></summary>
      <div className="pb-4 text-sm leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}
