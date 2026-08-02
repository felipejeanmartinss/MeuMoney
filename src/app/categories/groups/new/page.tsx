import Link from "next/link";
import { CategoryGroupForm } from "@/components/forms/category-group-form";

export const metadata = { title: "Novo grupo de categorias" };

export default function NewCategoryGroupPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href="/categories" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Voltar para categorias
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Novo grupo de categorias
        </h1>
        <p className="mt-2 text-slate-600">
          Agrupe categorias relacionadas para relatórios e orçamentos mais claros.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CategoryGroupForm values={{}} />
      </section>
    </main>
  );
}
