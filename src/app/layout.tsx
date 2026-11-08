import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const display = Sora({ subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

const name = process.env.NEXT_PUBLIC_APP_NAME || "kddf-market";

export const metadata: Metadata = {
  title: { default: `${name} — Vendez vos produits digitaux`, template: `%s · ${name}` },
  description: "Vendez des ebooks, formations, licences, coaching et services. Paiement Mobile Money, cartes, PayPal et crypto.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
};

export const viewport = { themeColor: "#0B0B10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${display.variable} ${body.variable} font-sans min-h-screen`}>
        <Navbar />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} {name} — Paiements sécurisés
        </footer>
      </body>
    </html>
  );
}
