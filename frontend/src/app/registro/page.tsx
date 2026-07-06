import type { Metadata } from "next";
import { CheckCircle2, Shield } from "lucide-react";
import { HeroSection } from "@/components/HeroSection";
import { Section } from "@/components/Section";
import { RegistrationForm } from "@/components/RegistrationForm";
import type { FormFieldProps } from "@/components/RegistrationForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Solicitar acceso inicial",
  description:
    "Solicita acceso a CanalAgenda: revisamos cada solicitud para coordinar la configuración inicial y el despliegue guiado.",
};

const baseFields: FormFieldProps[] = [
  {
    name: "negocioNombre",
    label: "Nombre comercial del negocio",
    type: "text",
    placeholder: "Ej. Estética Norte / Bar Central",
    required: true,
    hint: "Tal como quieres que figure en comunicaciones internas o pilotos.",
  },
  {
    name: "contactoNombre",
    label: "Persona de contacto",
    type: "text",
    placeholder: "Nombre y apellidos",
    required: true,
  },
  {
    name: "email",
    label: "Correo profesional",
    type: "email",
    placeholder: "nombre@tu-empresa.com",
    required: true,
    hint: "Usaremos este correo para confirmar la solicitud y coordinar los siguientes pasos.",
  },
  {
    name: "telefono",
    label: "Teléfono de contacto",
    type: "tel",
    placeholder: "Ej. +34 600 000 000",
    required: true,
  },
];

const operationFields: FormFieldProps[] = [
  {
    name: "tipoNegocio",
    label: "Tipo de negocio",
    type: "select",
    options: [
      "Peluquería o salón",
      "Centro de estética",
      "Restaurante u hostelería",
      "Clínica o consultorio",
      "Comercio con cita previa",
      "Otro servicio con reserva",
    ],
    required: true,
  },
  {
    name: "ciudad",
    label: "Ciudad o zona principal",
    type: "text",
    placeholder: "Ej. Madrid · Barcelona · remoto",
    required: true,
  },
  {
    name: "web",
    label: "Web o perfil público (opcional)",
    type: "url",
    placeholder: "https://",
    required: false,
    hint: "Ayuda a contextualizar tu negocio; puede ser web, Instagram o ficha de Google.",
  },
  {
    name: "volumenesReservas",
    label: "Volumen orientativo de reservas al mes",
    type: "select",
    options: [
      "Menos de 30",
      "30 – 100",
      "100 – 400",
      "400 – 1.000",
      "Más de 1.000",
      "Aún no tengo tráfico estructurado",
    ],
    required: true,
  },
  {
    name: "sedes",
    label: "Número de sedes o locales",
    type: "select",
    options: ["1", "2 – 3", "4 – 10", "Más de 10"],
    required: true,
  },
];

const contextFields: FormFieldProps[] = [
  {
    name: "notas",
    label: "Contexto adicional (opcional)",
    type: "textarea",
    placeholder:
      "Horarios críticos, servicios que requieren más tiempo, integraciones deseadas, etc.",
    required: false,
  },
];

const legalFields: FormFieldProps[] = [
  {
    name: "terminos",
    label: "He leído y acepto los términos del servicio y la política de privacidad.",
    type: "checkbox",
    required: true,
  },
];

export default function Registro() {
  return (
    <>
      <HeroSection
        eyebrow={`${site.name} · incorporaciones`}
        title="Solicitud de acceso inicial"
        subtitle="Revisamos cada solicitud antes de activar el acceso: en esta fase la implantación es guiada y coordinamos contigo permisos, sedes y calendarios."
      />

      <Section
        title="Formulario de solicitud"
        subtitle="Unos minutos de contexto operativo nos permiten responder con criterio. Los datos se usan solo para evaluar encaje y contacto comercial."
        centered={false}
      >
        <div className="max-w-5xl mx-auto grid lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          <aside className="lg:col-span-4 order-2 lg:order-1 space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-3">
                <Shield className="w-5 h-5 text-emerald-700" aria-hidden />
                Qué puedes esperar
              </div>
              <ul className="space-y-3 text-sm text-slate-600 leading-relaxed">
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                  Revisamos cada solicitud antes de activar el acceso inicial.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                  Durante esta fase la implantación se realiza de forma guiada.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                  No pedimos datos de pago aquí; el siguiente paso es conversación directa.
                </li>
              </ul>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed px-1">
              Casos multi‑sede o urgentes: indícalo en el mensaje adicional o escribe a{" "}
              <a
                href={`mailto:${site.contactEmail}`}
                className="text-emerald-800 font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 rounded"
              >
                {site.contactEmail}
              </a>
              .
            </p>
          </aside>

          <div className="lg:col-span-8 order-1 lg:order-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 md:p-10 shadow-sm">
              <div className="mb-8 pb-6 border-b border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Datos de tu organización
                </h3>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Campos obligatorios marcados con <span className="text-red-500">*</span>. Tardarás
                  menos si tienes a mano web o volumen aproximado de reservas.
                </p>
              </div>
              <RegistrationForm
                groups={[
                  {
                    title: "Contacto y negocio",
                    description: "Quién eres y cómo te contactamos.",
                    fields: baseFields,
                  },
                  {
                    title: "Tu operación",
                    description: "Nos ayuda a orientar la primera respuesta.",
                    fields: operationFields,
                  },
                  {
                    title: "Contexto",
                    description: "Opcional pero útil para priorizar.",
                    fields: contextFields,
                  },
                  {
                    title: "Legal",
                    fields: legalFields,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        className="bg-slate-50"
        title="Qué ocurre después de enviar"
        subtitle="Transparencia sobre los siguientes pasos; sin promesas de plazos que no podamos cumplir."
      >
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-5 md:gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-emerald-700 font-bold text-sm mb-2">01</div>
            <h3 className="font-semibold text-slate-900 mb-2">Acuse y revisión</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Confirmamos recepción y revisamos encaje técnico y comercial con el equipo interno.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-emerald-700 font-bold text-sm mb-2">02</div>
            <h3 className="font-semibold text-slate-900 mb-2">Contacto directo</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Acordamos una llamada o videollamada para perfilar sedes, calendarios y expectativas.
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-emerald-700 font-bold text-sm mb-2">03</div>
            <h3 className="font-semibold text-slate-900 mb-2">Plan de activación</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Definimos hitos de configuración, accesos y pruebas antes de abrir el flujo a clientes
              finales.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
