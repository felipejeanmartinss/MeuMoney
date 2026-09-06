"use client";

import {
  buildCategorySelectionOptions,
  buildTransferSelectionOptions,
} from "@/domain/category-selection";
import type {
  CategorySelectionAccount,
  CategorySelectionCategory,
  CategorySelectionCreditCard,
} from "@/domain/category-selection";
import type { TransactionType } from "@/types/database";
import { SearchableSelect } from "./searchable-select";

export function CategoryCombobox({
  name = "categoryId",
  categories,
  transactionType,
  value,
  defaultValue,
  onValueChange,
  transferAccounts = [],
  transferCreditCards = [],
  sourceAccountId = null,
  prefixCategoryValue = false,
  invalid = false,
  compact = false,
}: {
  name?: string;
  categories: CategorySelectionCategory[];
  transactionType: TransactionType;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  transferAccounts?: CategorySelectionAccount[];
  transferCreditCards?: CategorySelectionCreditCard[];
  sourceAccountId?: string | null;
  prefixCategoryValue?: boolean;
  invalid?: boolean;
  compact?: boolean;
}) {
  const options = [
    ...buildCategorySelectionOptions(categories, transactionType, {
      prefixValue: prefixCategoryValue,
    }),
    ...buildTransferSelectionOptions(
      transferAccounts,
      sourceAccountId,
      transferCreditCards,
    ),
  ];

  return (
    <SearchableSelect
      name={name}
      options={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      invalid={invalid}
      compact={compact}
      emptyMessage="Nenhuma categoria ou conta compatível encontrada."
    />
  );
}
