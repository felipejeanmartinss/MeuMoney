import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/forms/category-form";
import { categoryIdSchema } from "@/domain/categories";
import {
  getCurrentUserCategory,
  listCurrentUserCategories,
} from "@/services/finance/categories-service";

export const metadata = { title: "Editar categoria" };

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = categoryIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const [categoryResult, categoriesResult] = await Promise.all([
    getCurrentUserCategory(parsedId.data),
    listCurrentUserCategories(),
  ]);
  if (
    categoryResult.hasError ||
    categoriesResult.hasError ||
    !categoryResult.category
  ) {
    notFound();
  }
  const category = categoryResult.category;

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
          Editar categoria
        </h1>
        <p className="mt-2 text-slate-600">
          Ajuste o nome ou organize esta categoria como subcategoria.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CategoryForm
          categories={categoriesResult.categories}
          groups={categoriesResult.groups}
          values={{
            id: category.id,
            name: category.name,
            kind: category.kind,
            context: category.context,
            groupId: category.group_id,
            parentId: category.parent_id,
          }}
        />
      </section>
    </main>
  );
}
