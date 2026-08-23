/**
 * UNA PÁGINA DE SECTOR, MISMA PLANTILLA PARA TODOS.
 *
 * La estructura es igual para peluquerías que para talleres; lo que cambia es
 * el CONTENIDO, que vive en `lib/verticales.ts`. Así añadir un sector nuevo es
 * escribir sus textos, no maquetar otra página — y ninguna se queda vieja
 * cuando se mejora la plantilla.
 *
 * El orden de los bloques no es casual: primero el dolor con las palabras del
 * sector, después la conversación real (que es el producto), después lo que
 * un calendario genérico NO resuelve, y solo al final el precio y el alta.
 */

import Link from "next/link";
import { Check } from "lucide-react";
import { HeroSection } from "@/components/HeroSection";
import { Section } from "@/components/Section";
import { FAQ } from "@/components/FAQ";
import { cta } from "@/lib/cta";
import type { Vertical } from "@/lib/verticales";

export function PaginaVertical({ v }: { v: Vertical }) {
  // El alta lleva el sector puesto: quien entra por «peluquerías» no debería
  // tener que volver a decir que tiene una peluquería.
  const altaConSector = `${cta.primary.href}?sector=${v.codigo}`;

  return (
    <>
      <HeroSection
        eyebrow={v.hero.eyebrow}
        title={v.hero.titulo}
        subtitle={v.hero.subtitulo}
        primaryCTA={{ text: cta.primary.label, href: altaConSector }}
        secondaryCTA={{ text: cta.talk.label, href: cta.talk.href }}
      />

      <Section
        title={`Lo que pasa hoy en tu ${v.plural.replace(/s$/, "")}`}
        subtitle="Tres cosas que cuestan dinero y no salen en ningún informe."
        className="bg-slate-50"
      >
        <div className="grid gap-5 md:grid-cols-3">
          {v.dolores.map((d) => (
            <div key={d.titulo} className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 font-semibold text-slate-900">{d.titulo}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{d.texto}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Así es la conversación"
        subtitle="Sin apps que instalar, sin enlaces raros. WhatsApp, como siempre."
        containerClassName="max-w-3xl"
      >
        <div className="space-y-3">
          {v.ejemplos.conversacion.map((linea, i) => (
            <div
              key={i}
              className={
                i % 2 === 0
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-3 text-sm text-white"
                  : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800"
              }
            >
              {linea}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Servicios de ejemplo: {v.ejemplos.servicios.join(" · ")}
        </p>
      </Section>

      <Section
        title="Lo que una agenda cualquiera no resuelve"
        subtitle={`Aquí está la diferencia entre un calendario y algo hecho para ${v.plural}.`}
        className="bg-slate-50"
      >
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          {v.especificos.map((e) => (
            <div key={e.titulo} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-5">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <h3 className="mb-1 font-semibold text-slate-900">{e.titulo}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{e.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Preguntas que nos hacen siempre" containerClassName="max-w-3xl">
        <FAQ items={v.faq} />
      </Section>

      <section className="border-t border-slate-200 bg-white px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="mx-auto mb-3 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          Pruébalo con tu propia agenda
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-slate-600">
          Estamos en acceso inicial revisado: acompañamos cada alta para que el asistente hable como
          hablas tú.
        </p>
        <Link
          href={altaConSector}
          className="inline-flex min-h-[48px] items-center rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          {cta.primary.label}
        </Link>
      </section>
    </>
  );
}
