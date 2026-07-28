import { z } from "zod";

export const PERSONAL_BACKUP_SCHEMA_VERSION = 1;
export const MAX_PERSONAL_BACKUP_BYTES = 10 * 1024 * 1024;

const rowSchema = z.record(z.string(), z.unknown());
const requiredTables = [
  "profiles",
  "accounts",
  "categories",
  "recurring_transactions",
  "transfers",
  "transfer_entries",
  "credit_cards",
  "credit_card_purchases",
  "credit_card_invoices",
  "credit_card_installments",
  "transactions",
  "monthly_budgets",
  "net_worth_items",
  "net_worth_valuations",
  "investment_positions",
  "investment_position_snapshots",
  "investment_cash_flows",
  "import_jobs",
  "import_staging_rows",
  "imported_transaction_signatures",
  "critical_operation_events",
] as const;

const dataShape = Object.fromEntries(
  requiredTables.map((table) => [table, z.array(rowSchema)]),
) as Record<(typeof requiredTables)[number], z.ZodArray<typeof rowSchema>>;

export const personalBackupSchema = z
  .object({
    product: z.literal("MeuMoney"),
    schema_version: z.literal(PERSONAL_BACKUP_SCHEMA_VERSION),
    exported_at: z.string().min(1),
    identity: z
      .object({
        email: z.email(),
      })
      .optional(),
    data: z.object(dataShape).strict(),
  })
  .strict()
  .superRefine((backup, context) => {
    if (backup.data.profiles.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["data", "profiles"],
        message: "O backup deve conter exatamente um perfil.",
      });
    }
  });

export type PersonalBackup = z.infer<typeof personalBackupSchema>;

export function parsePersonalBackup(value: unknown) {
  return personalBackupSchema.safeParse(value);
}

export function personalBackupFileName(date = new Date()) {
  return `meumoney-backup-${date.toISOString().slice(0, 10)}.json`;
}
