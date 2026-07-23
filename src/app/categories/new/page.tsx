import Link from "next/link";
import { CategoryForm } from "@/components/forms/category-form";

export const metadata = { title: "Nova categoria" };

export default function NewCategoryPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/categories"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para categorias
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Nova categoria
        </h1>
        <p className="mt-2 text-slate-600">
          Crie uma classificação complementar para sua realidade pessoal ou
          profissional.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CategoryForm values={{}} />
      </section>
    </main>
  );
}
