import {
  mapFinancialImportQifCategory,
  mapFinancialImportQifTransferAccount,
} from "@/app/actions/file-imports";
import type {
  Account,
  Category,
  ImportStagingRow,
  TransactionType,
} from "@/types/database";
import { inputClass } from "./form-controls";

type CategoryMapping = {
  sourceName: string;
  transactionType: TransactionType;
  categoryId: string | null;
};

type TransferMapping = {
  sourceName: string;
  accountId: string | null;
};

export function QifMappingPanel({
  jobId,
  rows,
  accounts,
  categories,
  sourceAccountId,
  page,
}: {
  jobId: string;
  rows: ImportStagingRow[];
  accounts: Pick<Account, "id" | "name" | "currency">[];
  categories: Pick<Category, "id" | "name" | "kind" | "context">[];
  sourceAccountId: string | null;
  page: number;
}) {
  const categoryMappings = new Map<string, CategoryMapping>();
  const transferMappings = new Map<string, TransferMapping>();

  for (const row of rows) {
    if (
      row.record_kind === "transaction" &&
      row.source_category_name &&
      row.signed_amount_minor
    ) {
      const transactionType =
        row.signed_amount_minor > 0 ? "income" : "expense";
      const key = `${transactionType}:${row.source_category_name}`;
      if (!categoryMappings.has(key)) {
        categoryMappings.set(key, {
          sourceName: row.source_category_name,
          transactionType,
          categoryId: row.category_id,
        });
      }
    }
    if (row.record_kind === "transfer" && row.transfer_account_name) {
      if (!transferMappings.has(row.transfer_account_name)) {
        transferMappings.set(row.transfer_account_name, {
          sourceName: row.transfer_account_name,
          accountId: row.transfer_account_id,
        });
      }
    }
  }

  if (categoryMappings.size === 0 && transferMappings.size === 0) return null;

  const sourceAccount = accounts.find(
    (account) => account.id === sourceAccountId,
  );
  const compatibleTransferAccounts = accounts.filter(
    (account) =>
      account.id !== sourceAccountId &&
      (!sourceAccount || account.currency === sourceAccount.currency),
  );

  return (
    <section className="grid gap-5 rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-extrabold text-blue-950">
          Mapeamentos do QIF nesta página
        </h2>
        <p className="mt-1 text-sm text-blue-900">
          Uma escolha é aplicada a todas as linhas do arquivo com o mesmo nome
          de origem. O QIF original permanece apenas como referência na
          revisão.
        </p>
      </div>

      {categoryMappings.size > 0 ? (
        <div className="grid gap-3">
          <h3 className="font-bold text-slate-950">Categorias sugeridas</h3>
          {[...categoryMappings.values()].map((mapping) => (
            <form
              action={mapFinancialImportQifCategory}
              className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
              key={`${mapping.transactionType}:${mapping.sourceName}`}
            >
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="page" value={page} />
              <input
                type="hidden"
                name="sourceCategoryName"
                value={mapping.sourceName}
              />
              <input
                type="hidden"
                name="transactionType"
                value={mapping.transactionType}
              />
              <p className="text-sm text-slate-700">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  {mapping.transactionType === "income"
                    ? "Receita no QIF"
                    : "Despesa no QIF"}
                </span>
                <span className="mt-1 block font-semibold text-slate-950">
                  {mapping.sourceName}
                </span>
              </p>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Categoria no MeuMoney
                <select
                  className={inputClass()}
                  name="categoryId"
                  defaultValue={mapping.categoryId ?? ""}
                  required
                >
                  <option value="">Selecione</option>
                  {categories
                    .filter(
                      (category) =>
                        category.kind === mapping.transactionType,
                    )
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.context === "professional"
                          ? "Profissional"
                          : "Pessoal"}{" "}
                        · {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <button className="min-h-12 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Aplicar
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {transferMappings.size > 0 ? (
        <div className="grid gap-3">
          <h3 className="font-bold text-slate-950">
            Contas citadas em transferências
          </h3>
          {[...transferMappings.values()].map((mapping) => (
            <form
              action={mapFinancialImportQifTransferAccount}
              className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
              key={mapping.sourceName}
            >
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="page" value={page} />
              <input
                type="hidden"
                name="sourceAccountName"
                value={mapping.sourceName}
              />
              <p className="text-sm text-slate-700">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Conta no QIF
                </span>
                <span className="mt-1 block font-semibold text-slate-950">
                  {mapping.sourceName}
                </span>
              </p>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Conta correspondente no MeuMoney
                <select
                  className={inputClass()}
                  name="accountId"
                  defaultValue={mapping.accountId ?? ""}
                  required
                >
                  <option value="">Selecione</option>
                  {compatibleTransferAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.currency}
                    </option>
                  ))}
                </select>
              </label>
              <button className="min-h-12 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Aplicar
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </section>
  );
}
