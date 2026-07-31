import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/pwa/pwa-registration";
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
  return <html lang="pt-BR"><body>{children}<PwaRegistration /></body></html>;
}
