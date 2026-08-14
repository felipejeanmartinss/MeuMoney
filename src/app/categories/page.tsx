import Link from "next/link";
import { toggleCategoryStatus } from "@/app/actions/categories";
import { CONTEXT_LABELS, FINANCIAL_CONTEXTS } from "@/domain/accounts";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "@/domain/categories";
import { listCurrentUserCategories } from "@/services/finance/categories-service";
import type { Category, CategoryGroup } from "@/types/database";

export const metadata = { title: "Categorias" };

const messages: Record<string, string> = {
  created: "Categoria criada com sucesso.",
  updated: "Categoria atualizada com sucesso.",
  deleted: "Categoria excluída e vínculos realocados com sucesso.",
  "status-updated": "Status da categoria atualizado com sucesso.",
  "status-error": "Não foi possível alterar o status da categoria.",
  "group-created": "Grupo criado com sucesso.",
  "group-updated": "Grupo atualizado com sucesso.",
};

function orderedCategories(categories: Category[]) {
  const roots = categories.filter((category) => category.parent_id === null);
  return roots.flatMap((root) => [
    root,
    ...categories.filter((category) => category.parent_id === root.id),
  ]);
}

function CategoryRow({
  category,
  group,
}: {
  category: Category;
  group: CategoryGroup;
}) {
  const archived = Boolean(category.archived_at);
  const isSubcategory = Boolean(category.parent_id);

  return (
    <tr className={archived ? "bg-slate-50 text-slate-500" : "bg-white"}>
      <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-950">
        <span className={isSubcategory ? "pl-5 font-normal" : ""}>
          {isSubcategory ? "↳ " : ""}
          {category.name}
        </span>
      </td>
      <td className="border-b border-slate-200 px-3 py-2 text-slate-600">
        <Link
          href={`/categories/groups/${group.id}/edit`}
          className="hover:text-blue-700 hover:underline"
        >
          {group.name}
        </Link>
      </td>
      <td className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
        {isSubcategory ? "Subcategoria" : "Categoria"}
        {category.is_system ? " · sugestão inicial" : ""}
      </td>
      <td className="border-b border-slate-200 px-3 py-2 text-xs font-bold">
        {archived ? "Inativa" : "Ativa"}
      </td>
      <td className="border-b border-slate-200 px-3 py-1.5">
        <div className="flex justify-end gap-1 whitespace-nowrap">
          <Link
            href={`/categories/${category.id}/edit`}
            className="rounded-md px-2 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
          >
            Editar / excluir
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
              className="rounded-md px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              {archived ? "Reativar" : "Inativar"}
            </button>
          </form>
        </div>
      </td>
    </tr>
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
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Organização
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Categorias
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Uma grade compacta para administrar grupos, categorias e
            subcategorias sem perder a visão do conjunto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/categories/groups/new"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-800 hover:bg-slate-50"
          >
            Novo grupo
          </Link>
          <Link
            href="/categories/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 font-bold text-white hover:bg-blue-800"
          >
            Nova categoria
          </Link>
        </div>
      </header>

      <aside className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        As sugestões iniciais são opcionais. Você pode editar, inativar ou
        excluir todas e trabalhar apenas com a estrutura que fizer sentido.
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
          Não foi possível carregar suas categorias. Confirme se todas as
          migrations foram aplicadas.
        </p>
      ) : null}

      {!hasError && categories.length === 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          Você está sem categorias. Crie somente as categorias e subcategorias
          que desejar; também é possível criá-las durante um lançamento ou uma
          importação.
        </section>
      ) : null}

      <div className="grid gap-5">
        {FINANCIAL_CONTEXTS.flatMap((context) =>
          CATEGORY_KINDS.map((kind) => {
            const matchingGroups = groups.filter(
              (group) => group.context === context && group.kind === kind,
            );
            const matchingCategories = categories.filter(
              (category) =>
                category.context === context && category.kind === kind,
            );
            if (matchingGroups.length === 0 && matchingCategories.length === 0) {
              return null;
            }

            return (
              <section
                key={`${context}-${kind}`}
                className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-slate-100 px-3 py-2">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">
                    {CATEGORY_KIND_LABELS[kind]} · {CONTEXT_LABELS[context]}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {matchingCategories.length} itens
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Categorias de {CATEGORY_KIND_LABELS[kind].toLowerCase()} no
                      contexto {CONTEXT_LABELS[context].toLowerCase()}
                    </caption>
                    <thead className="bg-blue-50 text-xs uppercase tracking-wide text-blue-950">
                      <tr>
                        <th className="w-[34%] px-3 py-2 font-bold">Categoria</th>
                        <th className="w-[24%] px-3 py-2 font-bold">Grupo</th>
                        <th className="w-[18%] px-3 py-2 font-bold">Nível</th>
                        <th className="w-[10%] px-3 py-2 font-bold">Situação</th>
                        <th className="px-3 py-2 text-right font-bold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingGroups.flatMap((group) => {
                        const groupCategories = orderedCategories(
                          matchingCategories.filter(
                            (category) => category.group_id === group.id,
                          ),
                        );
                        if (groupCategories.length === 0) {
                          return [
                            <tr key={`empty-${group.id}`} className="bg-white">
                              <td className="border-b border-slate-200 px-3 py-2 italic text-slate-400">
                                Sem categorias
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2">
                                <Link
                                  href={`/categories/groups/${group.id}/edit`}
                                  className="font-semibold text-blue-700 hover:underline"
                                >
                                  {group.name}
                                </Link>
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2" />
                              <td className="border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-500">
                                {group.archived_at ? "Inativo" : "Ativo"}
                              </td>
                              <td className="border-b border-slate-200 px-3 py-2" />
                            </tr>,
                          ];
                        }
                        return groupCategories.map((category) => (
                          <CategoryRow
                            key={category.id}
                            category={category}
                            group={group}
                          />
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          }),
        )}
      </div>
    </main>
  );
}
