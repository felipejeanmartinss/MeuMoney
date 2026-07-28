import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePersonalBackup,
  personalBackupFileName,
} from "../src/domain/personal-backup";
import { createSafeErrorEvent } from "../src/lib/monitoring";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260728192413_personal_beta_hardening.sql",
  ),
  "utf8",
);

const allMigrations = readdirSync(resolve("supabase", "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) =>
    readFileSync(resolve("supabase", "migrations", name), "utf8"),
  )
  .join("\n");

const userTables = [
  "profiles",
  "accounts",
  "categories",
  "transactions",
  "transfers",
  "transfer_entries",
  "credit_cards",
  "credit_card_purchases",
  "credit_card_invoices",
  "credit_card_installments",
  "recurring_transactions",
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
];

function validBackup() {
  const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    userTables.map((table) => [table, []]),
  );
  tables.profiles = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      full_name: "Pessoa de teste",
      preferred_currency: "BRL",
    },
  ];
  return {
    product: "MeuMoney",
    schema_version: 1,
    exported_at: "2026-07-28T00:00:00.000Z",
    data: tables,
  };
}

describe("personal beta hardening", () => {
  it("keeps RLS enabled for every user-owned table", () => {
    for (const table of userTables) {
      expect(allMigrations).toMatch(
        new RegExp(
          `alter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
          "i",
        ),
      );
    }
  });

  it("exposes only owner-readable immutable critical history", () => {
    expect(migration).toContain(
      'create policy "critical_operation_events_owner_select"',
    );
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain(
      "grant select on table public.critical_operation_events to authenticated",
    );
    expect(migration).not.toContain(
      "grant insert on table public.critical_operation_events",
    );
  });

  it("uses authenticated, empty-search-path database boundaries", () => {
    expect(migration).toContain("current_user_id uuid := (select auth.uid())");
    expect(migration.match(/set search_path = ''/g)?.length).toBeGreaterThan(5);
    expect(migration).toContain(
      "revoke all on function private.restore_personal_backup(jsonb)",
    );
    expect(migration).toContain("backup_cross_tenant_reference");
  });

  it("accepts a complete versioned backup and rejects malformed input", () => {
    expect(parsePersonalBackup(validBackup()).success).toBe(true);
    expect(
      parsePersonalBackup({ ...validBackup(), schema_version: 2 }).success,
    ).toBe(false);
    const missingAccounts = validBackup();
    delete missingAccounts.data.accounts;
    expect(parsePersonalBackup(missingAccounts).success).toBe(false);
  });

  it("creates a stable, date-scoped backup filename", () => {
    expect(
      personalBackupFileName(new Date("2026-07-28T12:00:00.000Z")),
    ).toBe("meumoney-backup-2026-07-28.json");
  });

  it("sanitizes error monitoring payloads", () => {
    const error = Object.assign(
      new Error("Saldo 123, senha segredo, cliente@example.com"),
      { digest: "safe-digest" },
    );
    const event = createSafeErrorEvent(error, {
      routePath: "/transactions",
      routeType: "render",
      method: "GET",
    });
    const serialized = JSON.stringify(event);

    expect(event.digest).toBe("safe-digest");
    expect(serialized).not.toContain("Saldo 123");
    expect(serialized).not.toContain("segredo");
    expect(serialized).not.toContain("cliente@example.com");
  });

  it("never caches authenticated navigation or API data in the service worker", () => {
    const serviceWorker = readFileSync(resolve("public", "sw.js"), "utf8");
    expect(serviceWorker).toContain('request.mode === "navigate"');
    expect(serviceWorker).toContain("fetch(request).catch");
    expect(serviceWorker).not.toContain('pathname.startsWith("/api/")');
    expect(serviceWorker).not.toContain('"/dashboard"');
  });
});
