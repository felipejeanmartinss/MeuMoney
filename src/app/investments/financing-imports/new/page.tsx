import Link from "next/link";
import { FinancingImportUploadForm } from "@/components/forms/financing-import-upload-form";

export const metadata = { title: "Importar financiamento" };

export default function NewFinancingImportPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header>
        <Link
          href="/investments?tab=financing"
          className="text-sm font-bold text-emerald-700 hover:underline"
        >
          ← Voltar para financiamentos
        </Link>
        <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          Importação assistida
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Extrato do financiamento
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Importe parcelas, principal, juros, encargos, saldo devedor e
          amortizações extraordinárias para revisão antes de criar o contrato.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <FinancingImportUploadForm />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <h2 className="font-extrabold text-slate-950">
          Prefere informar o histórico manualmente?
        </h2>
        <p className="mt-1 text-slate-600">
          Cadastre contrato, taxas, saldos e cada parcela em uma tabela,
          incluindo principal, juros, encargos e pagamentos.
        </p>
        <Link
          href="/investments/financings/new"
          className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          Cadastrar histórico manual
        </Link>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-extrabold">Suporte validado nesta versão</h2>
        <p className="mt-2 leading-6">
          Extrato Financeiro Bradesco, layout testado. A arquitetura aceita
          novos adaptadores, mas outros bancos só serão habilitados com PDFs
          anonimizados e testes representativos. PDFs digitalizados ou
          protegidos por senha não são processados.
        </p>
      </section>
    </main>
  );
}
