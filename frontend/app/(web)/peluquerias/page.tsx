import type { Metadata } from "next";
import { PaginaVertical } from "@/components/PaginaVertical";
import { PELUQUERIAS } from "@/lib/verticales";

// El título y la descripción son los que salen en Google. Van del contenido
// del sector, no de la marca: quien busca «citas por WhatsApp para
// peluquerías» tiene que leer esas palabras en el resultado.
export const metadata: Metadata = {
  title: PELUQUERIAS.seo.titulo,
  description: PELUQUERIAS.seo.descripcion
};

export default function Peluquerias() {
  return <PaginaVertical v={PELUQUERIAS} />;
}
