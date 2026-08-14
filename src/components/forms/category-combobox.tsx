"use client";

import {
  buildCategorySelectionOptions,
  buildTransferSelectionOptions,
} from "@/domain/category-selection";
import type {
  CategorySelectionAccount,
  CategorySelectionCategory,
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
  sourceAccountId = null,
  prefixCategoryValue = false,
  invalid = false,
}: {
  name?: string;
  categories: CategorySelectionCategory[];
  transactionType: TransactionType;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  transferAccounts?: CategorySelectionAccount[];
  sourceAccountId?: string | null;
  prefixCategoryValue?: boolean;
  invalid?: boolean;
}) {
  const options = [
    ...buildCategorySelectionOptions(categories, transactionType, {
      prefixValue: prefixCategoryValue,
    }),
    ...buildTransferSelectionOptions(transferAccounts, sourceAccountId),
  ];

  return (
    <SearchableSelect
      name={name}
      options={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      invalid={invalid}
      emptyMessage="Nenhuma categoria ou conta compatível encontrada."
    />
  );
}
