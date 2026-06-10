import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProspecOde Clientes - Scraper de Leads Google Maps",
  description: "Encontre leads qualificados diretamente do Google Maps. Extraia nomes, telefones, endereços e avaliações de estabelecimentos automaticamente.",
  keywords: "leads, google maps, scraper, prospecção, clientes, negócios",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a1a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
