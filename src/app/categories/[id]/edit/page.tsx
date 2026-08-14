import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/forms/category-form";
import { CategoryDeletionForm } from "@/components/forms/category-deletion-form";
import { categoryIdSchema } from "@/domain/categories";
import {
  getCurrentUserCategoryDeletionImpact,
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

  const [deletionImpact, categoriesResult] = await Promise.all([
    getCurrentUserCategoryDeletionImpact(parsedId.data),
    listCurrentUserCategories(),
  ]);
  if (
    deletionImpact.hasError ||
    categoriesResult.hasError ||
    !deletionImpact.category
  ) {
    notFound();
  }
  const category = deletionImpact.category;

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
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 sm:p-8">
        <h2 className="text-xl font-extrabold text-red-950">Excluir categoria</h2>
        <p className="mt-2 text-sm leading-6 text-red-900">
          Use esta opção somente quando não quiser manter a categoria nem como
          inativa. A operação é atômica e não deixa lançamentos sem classificação.
        </p>
        <div className="mt-5">
          <CategoryDeletionForm
            categoryId={category.id}
            categoryName={category.name}
            referenceCount={deletionImpact.referenceCount}
            childCount={deletionImpact.childCount}
            replacementCategories={deletionImpact.replacementCategories}
          />
        </div>
      </section>
    </main>
  );
}
