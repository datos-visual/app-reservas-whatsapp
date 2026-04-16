import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { site } from "@/lib/site";
import { inter } from "@/lib/fonts";

const metadataBase =
  process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.length > 0
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined;

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase } : {}),
  title: {
    default: `${site.name} · ${site.descriptor}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  keywords: [...site.keywords],
  authors: [{ name: site.name }],
  openGraph: {
    title: `${site.name} · ${site.descriptor}`,
    description: site.description,
    type: "website",
    locale: "es_ES",
    siteName: site.name,
    ...(metadataBase ? { url: metadataBase.origin + "/" } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} · ${site.descriptor}`,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body
        className={`${inter.className} bg-white text-slate-900 font-sans antialiased min-h-screen flex flex-col`}
      >
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
