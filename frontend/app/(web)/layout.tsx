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

/**
 * Layout de la WEB COMERCIAL, no de toda la aplicación.
 *
 * `app/(web)/` es un GRUPO DE RUTAS: los paréntesis no salen en la URL, así
 * que `app/(web)/precios/page.tsx` se sirve en `/precios`. Sirve para darle a
 * la web pública su propia cabecera y pie sin que los herede el panel.
 *
 * Antes esto era el layout raíz de un proyecto aparte y traía `<html>` y
 * `<body>`. Aquí NO puede: esas etiquetas las pone `app/layout.tsx`, y
 * duplicarlas rompe la página entera. Las clases del `<body>` viejo se
 * conservan en este `<div>`.
 */
export default function WebLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.variable} ${inter.className} flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased`}>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
