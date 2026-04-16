import type { Metadata } from "next";
import { HeroSection } from "@/components/HeroSection";
import { Section } from "@/components/Section";
import { PricingCard } from "@/components/PricingCard";
import { site } from "@/lib/site";
import { cta } from "@/lib/cta";

export const metadata: Metadata = {
  title: "Precios y modalidad de acceso",
  description: `Acceso inicial controlado, implantación guiada y planes multi‑sede para reservas por WhatsApp con ${site.name}.`,
};

export default function Precios() {
  const plans = [
    {
      name: "Acceso inicial",
      price: "15,95€",
      priceCaption: "/mes",
      idealFor: "Ideal si quieres pilotar con una sede y un flujo de reserva claro.",
      description:
        "Entrada controlada mientras afinamos producto y operación. Activación revisada para mantener calidad de servicio.",
      features: [
        "Alta revisada caso por caso",
        "1 sede / calendario de referencia",
        "WhatsApp Cloud API (según tu cuenta Meta)",
        "Sincronización con Google Calendar",
        "Panel operativo esencial",
        "Soporte por correo en horario comercial",
      ],
      cta: cta.primary.label,
      ctaHref: cta.primary.href,
      badge: "Fase inicial",
    },
    {
      name: "Implantación guiada",
      price: "39,95€",
      priceCaption: "/mes",
      idealFor: "Ideal si necesitas acompañamiento en configuración, permisos y arranque.",
      description:
        "Para equipos que quieren sesiones de implantación y revisión de mensajes, reglas y calendario antes de escalar.",
      features: [
        "Sesiones de implantación guiada",
        "Parametrización por negocio y sede",
        "Revisión de mensajes y reglas de disponibilidad",
        "Ajustes de calendario y servicios",
        "Canal prioritario durante el arranque",
        "Opciones de facturación según volumen",
      ],
      cta: cta.talk.label,
      ctaHref: cta.talk.href,
      highlighted: true,
      badge: "Recomendado",
    },
    {
      name: "Multi‑sede",
      price: "Consultar",
      idealFor: "Ideal si gestionas varias ubicaciones o necesitas gobierno de datos más exigente.",
      description:
        "Operadores con varias tiendas, roles distribuidos o necesidades de coordinación y contrato a medida.",
      features: [
        "Esquema multi‑sede coherente",
        "Configuración por tienda o ubicación",
        "Calendarios y reglas independientes o federadas",
        "Acompañamiento en despliegue",
        "Facturación y alcance a medida",
        "Roadmap compartido (integraciones, informes)",
      ],
      cta: cta.talk.label,
      ctaHref: cta.talk.href,
      badge: "Empresas",
    },
  ];

  return (
    <>
      <HeroSection
        eyebrow={`${site.name} · comercial`}
        title="Precios con criterio de implantación"
        subtitle="Importes de referencia (prueba) en la web; el alcance contractual y la facturación final dependen de sedes, volumen y nivel de acompañamiento."
      />

      <Section
        title="Elige tu modalidad"
        subtitle="Precios de ejemplo para orientarte; el detalle fino lo afinamos en la primera conversación."
      >
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {plans.map((plan, index) => (
            <PricingCard key={index} plan={plan} />
          ))}
        </div>
      </Section>

      <Section className="bg-slate-50" title="Qué está incluido en el enfoque CanalAgenda">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-10 md:gap-12">
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">Base común del servicio</h3>
            <ul className="space-y-3">
              {[
                "Mensajería a través de WhatsApp Cloud API (Meta)",
                "Consulta de disponibilidad y confirmación de citas",
                "Registro de reservas trazable para el negocio",
                "Sincronización con Google Calendar",
                "Operación pensada por sede o tienda",
                "Buenas prácticas de seguridad y privacidad (ver documentación legal)",
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold mt-0.5" aria-hidden>
                    ✓
                  </span>
                  <span className="text-slate-700 text-sm leading-relaxed">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-4">Cómo leer los tres niveles</h3>
            <div className="space-y-4">
              <div className="border-l-4 border-emerald-500 pl-4 py-1">
                <p className="font-semibold text-slate-900">Acceso inicial</p>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Piloto acotado, una sede y activación revisada para mantener calidad de servicio.
                </p>
              </div>
              <div className="border-l-4 border-emerald-600 pl-4 py-1">
                <p className="font-semibold text-slate-900">Implantación guiada</p>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Acompañamiento explícito en configuración y arranque; encaje habitual para la mayoría
                  de negocios serios.
                </p>
              </div>
              <div className="border-l-4 border-emerald-800 pl-4 py-1">
                <p className="font-semibold text-slate-900">Multi‑sede</p>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Gobierno de varias ubicaciones, más coordinación y alcance contractual a medida.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6 leading-relaxed">
              Funcionalidades avanzadas (informes, integraciones adicionales, automatizaciones) se
              priorizan en roadmap con clientes activos; algunas figuran como{" "}
              <strong className="text-slate-700">próximamente</strong> según fase del producto.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Facturación y condiciones" className="bg-white">
        <div className="max-w-3xl mx-auto space-y-3">
          <details className="group border border-slate-200 rounded-xl p-5 md:p-6 cursor-pointer hover:bg-slate-50/80 transition open:shadow-sm">
            <summary className="font-semibold text-slate-900 list-none flex justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span>¿Por qué no publicáis una tarifa cerrada?</span>
              <span
                className="text-emerald-700 text-xl font-light leading-none group-open:rotate-45 transition-transform"
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="text-slate-600 mt-4 text-sm md:text-base leading-relaxed border-t border-slate-100 pt-4">
              Porque el coste real depende de sedes, volumen de conversaciones, nivel de
              acompañamiento y requisitos de integración. Preferimos una propuesta alineada con tu
              operación antes que un precio genérico que no se sostenga en el servicio.
            </p>
          </details>

          <details className="group border border-slate-200 rounded-xl p-5 md:p-6 cursor-pointer hover:bg-slate-50/80 transition open:shadow-sm">
            <summary className="font-semibold text-slate-900 list-none flex justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span>¿Hay periodo de prueba?</span>
              <span
                className="text-emerald-700 text-xl font-light leading-none group-open:rotate-45 transition-transform"
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="text-slate-600 mt-4 text-sm md:text-base leading-relaxed border-t border-slate-100 pt-4">
              Evaluamos casos bajo acceso inicial o piloto acotado; el alcance y la duración lo
              definimos contigo para que tenga sentido operativo y legal.
            </p>
          </details>

          <details className="group border border-slate-200 rounded-xl p-5 md:p-6 cursor-pointer hover:bg-slate-50/80 transition open:shadow-sm">
            <summary className="font-semibold text-slate-900 list-none flex justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span>¿Qué costes hay aparte del software?</span>
              <span
                className="text-emerald-700 text-xl font-light leading-none group-open:rotate-45 transition-transform"
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="text-slate-600 mt-4 text-sm md:text-base leading-relaxed border-t border-slate-100 pt-4">
              Meta puede facturar por el uso de WhatsApp Cloud API según su propia escala. Ese coste es
              ajeno a {site.name} y conviene tenerlo presente en la planificación.
            </p>
          </details>

          <details className="group border border-slate-200 rounded-xl p-5 md:p-6 cursor-pointer hover:bg-slate-50/80 transition open:shadow-sm">
            <summary className="font-semibold text-slate-900 list-none flex justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span>¿Podemos migrar de modalidad más adelante?</span>
              <span
                className="text-emerald-700 text-xl font-light leading-none group-open:rotate-45 transition-transform"
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="text-slate-600 mt-4 text-sm md:text-base leading-relaxed border-t border-slate-100 pt-4">
              Sí. El diseño multi‑sede permite crecer desde un piloto en una ubicación hasta varias
              sedes sin rehacer el planteamiento desde cero.
            </p>
          </details>
        </div>
      </Section>
    </>
  );
}
