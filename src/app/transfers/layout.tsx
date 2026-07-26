import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default function TransfersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
