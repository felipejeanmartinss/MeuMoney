type DatabaseError = { code?: string; message?: string } | null;

export function isMissingSubscriptionColumn(error: DatabaseError): boolean {
  if (error?.code !== "42703" && error?.code !== "PGRST204") return false;
  return error.message?.includes("is_subscription") ?? false;
}

export function withSubscriptionDefaults<T extends { is_subscription?: boolean }>(
  rows: T[],
): (T & { is_subscription: boolean })[] {
  return rows.map((row) => ({
    ...row,
    is_subscription: row.is_subscription ?? false,
  }));
}

export function withoutSubscriptionFlag<T extends { is_subscription: boolean }>(
  values: T,
): Omit<T, "is_subscription"> {
  const { is_subscription, ...compatibleValues } = values;
  void is_subscription;
  return compatibleValues;
}

export const subscriptionMigrationMessage =
  "Para marcar uma assinatura, atualize a estrutura do banco de dados.";
