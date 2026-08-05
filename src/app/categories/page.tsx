import Link from "next/link";
import { toggleCategoryStatus } from "@/app/actions/categories";
import {
  CONTEXT_LABELS,
  FINANCIAL_CONTEXTS,
} from "@/domain/accounts";
import {
  CATEGORY_KIND_LABELS,
  CATEGORY_KINDS,
} from "@/domain/categories";
import { listCurrentUserCategories } from "@/services/finance/categories-service";
import type { Category } from "@/types/database";

export const metadata = { title: "Categorias" };

const messages: Record<string, string> = {
  created: "Categoria criada com sucesso.",
  updated: "Categoria atualizada com sucesso.",
  "status-updated": "Status da categoria atualizado com sucesso.",
  "status-error": "Não foi possível alterar o status da categoria.",
  "group-created": "Grupo criado com sucesso.",
  "group-updated": "Grupo atualizado com sucesso.",
};

function CategoryItem({
  category,
  isSubcategory = false,
}: {
  category: Category;
  isSubcategory?: boolean;
}) {
  const archived = Boolean(category.archived_at);

  return (
    <article className={`rounded-xl border border-slate-200 bg-white p-4 ${archived ? "opacity-65" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">
            {isSubcategory ? "↳ " : ""}
            {category.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isSubcategory ? "Subcategoria" : "Categoria principal"} ·{" "}
            {category.is_system ? "Sugestão inicial" : "Personalizada"}
            {archived ? " · Inativa" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/categories/${category.id}/edit`}
            className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Editar
          </Link>
          <form action={toggleCategoryStatus}>
            <input type="hidden" name="id" value={category.id} />
            <input
              type="hidden"
              name="archive"
              value={archived ? "false" : "true"}
            />
            <button
              type="submit"
              className="rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              {archived ? "Reativar" : "Inativar"}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ categories, groups, hasError }, params] = await Promise.all([
    listCurrentUserCategories(),
    searchParams,
  ]);
  const feedback = params.message ? messages[params.message] : undefined;
  const feedbackIsError = params.message === "status-error";

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Organização
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Categorias
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Use as sugestões iniciais ou adapte toda a organização ao seu jeito.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/categories/groups/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-50"
          >
            Novo grupo
          </Link>
          <Link
            href="/categories/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white shadow-sm hover:bg-blue-800"
          >
            Nova categoria
          </Link>
        </div>
      </div>

      <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        As categorias iniciais são apenas sugestões. Todas podem ser editadas,
        inativadas e reativadas por você.
      </aside>

      {feedback ? (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback}
        </p>
      ) : null}

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar suas categorias. Confirme se a migration de
          grupos e subcategorias foi aplicada.
        </p>
      ) : null}

      {!hasError && categories.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          Nenhuma categoria foi encontrada. As sugestões iniciais serão criadas
          automaticamente para cada novo usuário.
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {FINANCIAL_CONTEXTS.map((context) => (
          <section
            key={context}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"
          >
            <h2 className="text-xl font-extrabold text-slate-950">
              {CONTEXT_LABELS[context]}
            </h2>
            <div className="mt-5 grid gap-6">
              {CATEGORY_KINDS.map((kind) => {
                const categorySet = categories.filter(
                  (category) =>
                    category.context === context && category.kind === kind,
                );
                const matchingGroups = groups.filter(
                  (group) => group.context === context && group.kind === kind,
                );
                return (
                  <div key={kind}>
                    <h3
                      className={`text-sm font-bold uppercase tracking-wider ${
                        kind === "income"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {CATEGORY_KIND_LABELS[kind]}
                    </h3>
                    {matchingGroups.length ? (
                      <div className="mt-3 grid gap-4">
                        {matchingGroups.map((categoryGroup) => {
                          const groupCategories = categorySet.filter(
                            (category) => category.group_id === categoryGroup.id,
                          );
                          const roots = groupCategories.filter(
                            (category) =>
                              category.parent_id === null ||
                              !groupCategories.some(
                                (candidate) => candidate.id === category.parent_id,
                              ),
                          );
                          return (
                            <section
                              key={categoryGroup.id}
                              className={`rounded-2xl border border-slate-200 bg-white p-3 ${
                                categoryGroup.archived_at ? "opacity-65" : ""
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                                <div>
                                  <h4 className="font-extrabold text-slate-950">
                                    {categoryGroup.name}
                                  </h4>
                                  <p className="text-xs text-slate-500">Grupo de relatório</p>
                                </div>
                                <Link
                                  href={`/categories/groups/${categoryGroup.id}/edit`}
                                  className="rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                                >
                                  Editar grupo
                                </Link>
                              </div>
                              {roots.length ? (
                                <ul className="grid gap-2">
                                  {roots.map((category) => {
                                    const children = groupCategories.filter(
                                      (candidate) => candidate.parent_id === category.id,
                                    );
                                    return (
                                      <li key={category.id} className="grid gap-2">
                                        <CategoryItem category={category} />
                                        {children.length ? (
                                          <ul
                                            aria-label={`Subcategorias de ${category.name}`}
                                            className="ml-4 grid gap-2 border-l-2 border-blue-100 pl-3"
                                          >
                                            {children.map((child) => (
                                              <li key={child.id}>
                                                <CategoryItem category={child} isSubcategory />
                                              </li>
                                            ))}
                                          </ul>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                                  Nenhuma categoria neste grupo.
                                </p>
                              )}
                            </section>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl bg-white p-4 text-sm text-slate-500">
                        Nenhuma categoria neste grupo.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
