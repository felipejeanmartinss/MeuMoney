import { ACCOUNT_TYPE_LABELS, CONTEXT_LABELS } from "./accounts";
import type {
  AccountType,
  FinancialContext,
  SupportedCurrency,
  TransactionType,
} from "@/types/database";

export type CategorySelectionCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: TransactionType;
  context: FinancialContext;
};

export type CategorySelectionAccount = {
  id: string;
  name: string;
  type: AccountType;
  currency: SupportedCurrency;
};

export type CategorySelectionCreditCard = {
  id: string;
  cardName: string;
  currency: SupportedCurrency;
};

export type SearchableSelectionOption = {
  value: string;
  label: string;
  group:
    | "Categorias"
    | "Transferências entre contas"
    | "Transferências para cartões";
  keywords: string;
};

const portugueseCollator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

export function normalizeSelectionSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCategorySelectionOptions(
  categories: CategorySelectionCategory[],
  transactionType: TransactionType,
  options: { prefixValue?: boolean } = {},
): SearchableSelectionOption[] {
  const byId = new Map(categories.map((category) => [category.id, category]));

  return categories
    .filter((category) => category.kind === transactionType)
    .map((category) => {
      const parent = category.parent_id
        ? byId.get(category.parent_id)
        : undefined;
      const categoryPath = parent
        ? `${parent.name} › ${category.name}`
        : category.name;
      const context = CONTEXT_LABELS[category.context];
      return {
        value: options.prefixValue
          ? `category:${category.id}`
          : category.id,
        label: `${context} · ${categoryPath}`,
        group: "Categorias" as const,
        keywords: `${context} ${parent?.name ?? ""} ${category.name}`,
        sortName: category.name,
      };
    })
    .sort(
      (left, right) =>
        portugueseCollator.compare(left.sortName, right.sortName) ||
        portugueseCollator.compare(left.label, right.label),
    )
    .map((option) => ({
      value: option.value,
      label: option.label,
      group: option.group,
      keywords: option.keywords,
    }));
}

export function buildTransferSelectionOptions(
  accounts: CategorySelectionAccount[],
  sourceAccountId: string | null,
  creditCards: CategorySelectionCreditCard[] = [],
): SearchableSelectionOption[] {
  const source = accounts.find((account) => account.id === sourceAccountId);
  if (!source) return [];

  const accountOptions = accounts
    .filter(
      (account) =>
        account.id !== source.id && account.currency === source.currency,
    )
    .sort((left, right) => portugueseCollator.compare(left.name, right.name))
    .map((account) => ({
      value: `transfer:${account.id}`,
      label: `Transferência · ${account.name} · ${ACCOUNT_TYPE_LABELS[account.type]}`,
      group: "Transferências entre contas" as const,
      keywords: `transferencia ${account.name} ${ACCOUNT_TYPE_LABELS[account.type]} ${account.currency}`,
    }));
  const creditCardOptions = creditCards
    .filter((card) => card.currency === source.currency)
    .sort((left, right) =>
      portugueseCollator.compare(left.cardName, right.cardName),
    )
    .map((card) => ({
      value: `credit-card:${card.id}`,
      label: `Transferência · ${card.cardName} · Cartão de crédito`,
      group: "Transferências para cartões" as const,
      keywords: `transferencia pagamento cartao credito ${card.cardName} ${card.currency}`,
    }));

  return [...accountOptions, ...creditCardOptions];
}

export function filterSelectionOptions(
  options: SearchableSelectionOption[],
  query: string,
) {
  const normalizedQuery = normalizeSelectionSearch(query);
  if (!normalizedQuery) return options;
  return options.filter((option) =>
    normalizeSelectionSearch(`${option.label} ${option.keywords}`).includes(
      normalizedQuery,
    ),
  );
}
