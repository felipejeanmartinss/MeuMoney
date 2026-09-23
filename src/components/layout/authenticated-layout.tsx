import { AppShell } from "./app-shell";
import { requireUser } from "@/services/auth/server-auth";

export async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <AppShell>{children}</AppShell>;
}
