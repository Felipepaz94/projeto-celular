import "./globals.css";
import {Toaster} from "../components/ui/sonner";

export const metadata = {
  title: "Estoque - Cadastro de Produtos",
  description: "Cadastro de estoque, PDV e vendas integrado ao Supabase.",
};

export default function RootLayout({children}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
      </head>
      <body>{children}<Toaster /></body>
    </html>
  );
}