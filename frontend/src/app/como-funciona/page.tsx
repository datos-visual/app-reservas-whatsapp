import type { Metadata } from "next";
import Link from "next/link";
import {
  MessageCircle,
  Calendar,
  Settings,
  Inbox,
  CheckCircle2,
  LayoutDashboard,
} from "lucide-react";
import { HeroSection } from "@/components/HeroSection";
import { Section } from "@/components/Section";
import { site } from "@/lib/site";
import { cta } from "@/lib/cta";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Recorrido de implantación de CanalAgenda: WhatsApp Cloud API, Google Calendar, configuración por negocio y panel por sede.",
};

export default function ComoFunciona() {
  const steps = [
    {
      number: "1",
      title: "Vincula tu canal de WhatsApp",
      description:
        "Autorizas el uso de tu número mediante WhatsApp Cloud API (Meta). Es el canal oficial: trazable y alineado con las políticas del proveedor.",
      icon: MessageCircle,
    },
    {
      number: "2",
      title: "Conecta Google Calendar",
      description:
        "Otorgas acceso al calendario que debe reflejar la disponibilidad. A partir de ahí el sistema consulta huecos con las reglas que definamos.",
      icon: Calendar,
    },
    {
      number: "3",
      title: "Configura el negocio por sede",
      description:
        "Horarios, servicios, duraciones y reglas por ubicación. La parametrización es clave para que las respuestas sean coherentes con tu operación real.",
      icon: Settings,
    },
    {
      number: "4",
      title: "Recibe conversaciones de reserva",
      description:
        "Los clientes escriben como siempre. El flujo guía disponibilidad, confirmación y registro sin depender de llamadas paralelas.",
      icon: Inbox,
    },
    {
      number: "5",
      title: "Sincroniza citas confirmadas",
      description:
        "Las reservas confirmadas generan o actualizan eventos en Google Calendar de forma acorde a tu configuración.",
      icon: CheckCircle2,
    },
    {
      number: "6",
      title: "Supervisa desde el panel",
      description:
        "Visualiza reservas y el estado de las conversaciones por sede. Complementa tu operación sin sustituir otras herramientas que ya uses.",
      icon: LayoutDashboard,
    },
  ];

  return (
    <>
      <HeroSection
        eyebrow={`${site.name} · implantación`}
        title="Cómo funciona el despliegue"
        subtitle="Seis hitos claros desde la autorización técnica hasta la operación diaria. No es magia: es configuración cuidadosa, API oficial y calendario alineado."
      />

      <Section
        title="Recorrido paso a paso"
        subtitle="Así ordenamos el trabajo en un proyecto real; el detalle se ajusta en la fase de implantación guiada."
        className="bg-gradient-to-b from-white to-slate-50"
        centered={false}
      >
        <div className="grid md:grid-cols-2 gap-10 md:gap-x-12 md:gap-y-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-sm ring-1 ring-emerald-700/15">
                      {step.number}
                    </div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Icon className="w-5 h-5 text-emerald-700" aria-hidden />
                      <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Detalles técnicos que importan"
        subtitle="Transparencia sobre dependencias externas y alcance del producto."
        className="bg-slate-50"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white p-6 md:p-7 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">WhatsApp Cloud API</h3>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              Utilizamos la API oficial de Meta, no conectores opacos. Necesitas cumplir los requisitos
              de negocio de Meta y disponer de un número apto. Eso garantiza continuidad y claridad
              frente a integraciones no soportadas.
            </p>
          </div>

          <div className="bg-white p-6 md:p-7 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Google Calendar</h3>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              La disponibilidad y los eventos confirmados se apoyan en el calendario que autorices. Los
              cambios manuales relevantes deben seguir criterios acordados para no desalinear el
              sistema.
            </p>
          </div>

          <div className="bg-white p-6 md:p-7 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Datos y seguridad</h3>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              Aplicamos controles de acceso, cifrado en tránsito y prácticas alineadas con proveedores
              de infraestructura reconocidos. El tratamiento detallado figura en la política de
              privacidad.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 md:p-7">
            <h3 className="font-semibold text-amber-950 mb-2">Despliegue progresivo</h3>
            <p className="text-amber-950/90 text-sm leading-relaxed">
              Algunas capacidades avanzadas (informes, automatizaciones adicionales, integraciones
              fuera de Meta/Google) se van incorporando según roadmap y feedback de clientes activos.
              Lo comunicamos con antelación cuando afecte a tu plan.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Privacidad y buen uso" subtitle="Resumen operativo; el detalle legal está en los documentos enlazados desde el pie de página.">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Datos de tus clientes</h3>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              Tú eres responsable del tratamiento respecto a tus propios clientes. Nosotros tratamos
              los datos necesarios para operar el servicio y delegamos el canal de mensajería en Meta
              según sus términos.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Datos de configuración</h3>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              La configuración de sedes, servicios y cuentas se considera información contractual. Las
              opciones de exportación o baja se gestionan según lo previsto en términos y privacidad.
            </p>
          </div>
        </div>
      </Section>

      <section className="py-14 md:py-16 px-4 sm:px-6 lg:px-8 bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">
            Siguiente paso
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-8">
            Si encaja con tu operación, solicita acceso inicial o revisa precios y modalidades antes de
            hablar con el equipo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
            <Link
              href={cta.primary.href}
              className="inline-flex justify-center items-center px-6 py-3 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-400 transition min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {cta.primary.label}
            </Link>
            <Link
              href="/precios"
              className="inline-flex justify-center items-center px-6 py-3 rounded-lg border border-slate-600 text-white font-semibold hover:bg-slate-800 transition min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Ver precios
            </Link>
            <Link
              href={cta.talk.href}
              className="inline-flex justify-center items-center px-6 py-3 rounded-lg text-slate-200 font-semibold hover:text-white hover:underline underline-offset-4 min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {cta.talk.label}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
