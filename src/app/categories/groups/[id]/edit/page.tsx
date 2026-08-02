import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryGroupForm } from "@/components/forms/category-group-form";
import { categoryGroupIdSchema } from "@/domain/categories";
import { getCurrentUserCategoryGroup } from "@/services/finance/categories-service";

export const metadata = { title: "Editar grupo de categorias" };

export default async function EditCategoryGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = categoryGroupIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const { group, hasError } = await getCurrentUserCategoryGroup(parsedId.data);
  if (hasError || !group) notFound();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href="/categories" className="text-sm font-semibold text-blue-700 hover:underline">
          ← Voltar para categorias
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Editar grupo
        </h1>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CategoryGroupForm
          values={{
            id: group.id,
            name: group.name,
            kind: group.kind,
            context: group.context,
          }}
        />
      </section>
    </main>
  );
}
