import Link from "next/link";

export function AuthPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4 py-10"><section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-8"><Link href="/" className="mb-8 inline-block text-xl font-extrabold tracking-tight text-blue-800">MeuMoney</Link><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">{title}</h1><p className="mb-7 mt-2 leading-6 text-slate-600">{description}</p><div className="grid gap-6">{children}</div></section></main>;
}
