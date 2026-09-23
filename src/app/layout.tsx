import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/pwa/pwa-registration";
import { TableSortController } from "@/components/tables/table-sort-controller";
import { PreserveFormScroll } from "@/components/layout/preserve-form-scroll";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MeuMoney", template: "%s | MeuMoney" },
  description: "Gestão financeira pessoal com clareza e segurança.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#12624f",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}<TableSortController /><Suspense fallback={null}><PreserveFormScroll /></Suspense><PwaRegistration /></body></html>;
}
