import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/services/auth/server-auth";

export const dynamic = "force-dynamic";

export default async function BudgetsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  return <AppShell>{children}</AppShell>;
}
