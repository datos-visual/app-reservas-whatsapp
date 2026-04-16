import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Clock } from "lucide-react";
import { HeroSection } from "@/components/HeroSection";
import { Section } from "@/components/Section";
import { RegistrationForm } from "@/components/RegistrationForm";
import { site } from "@/lib/site";
import { cta } from "@/lib/cta";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Contacta con CanalAgenda para dudas comerciales o técnicas sobre reservas por WhatsApp, Google Calendar y despliegue multi‑sede.",
};

export default function Contacto() {
  const mailto = `mailto:${site.contactEmail}`;

  const contactFormFields = [
    {
      name: "nombre",
      label: "Nombre y apellidos",
      type: "text",
      placeholder: "Tu nombre completo",
      required: true,
    },
    {
      name: "email",
      label: "Correo electrónico",
      type: "email",
      placeholder: "tu@empresa.com",
      required: true,
      hint: "Usamos este correo únicamente para responderte.",
    },
    {
      name: "asunto",
      label: "Asunto",
      type: "text",
      placeholder: "Ej. Multi‑sede · Integración · Precios",
      required: true,
    },
    {
      name: "mensaje",
      label: "Mensaje",
      type: "textarea",
      placeholder:
        "Tipo de negocio, sedes, volumen aproximado y qué necesitáis resolver en esta fase.",
      required: true,
    },
  ];

  return (
    <>
      <HeroSection
        eyebrow={`${site.name} · contacto`}
        title="Hablemos de tu operación"
        subtitle="Canal sobrio para equipos que evalúan reservas por WhatsApp con rigor: disponibilidad, confirmación, calendario y trazabilidad por sede. Respondemos por correo; no sustituye al proceso de solicitud de acceso."
      />

      <Section
        title="Canales"
        subtitle="Elige el modo que mejor encaje. Para incorporaciones nuevas, priorizamos el formulario de acceso con contexto completo."
        centered={false}
      >
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
                Correo
              </h3>
              <div className="flex gap-4">
                <Mail className="w-6 h-6 text-emerald-700 flex-shrink-0 mt-0.5" aria-hidden />
                <div>
                  <a
                    href={mailto}
                    className="text-emerald-800 font-semibold hover:underline break-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 rounded"
                  >
                    {site.contactEmail}
                  </a>
                  <p className="text-sm text-slate-600 mt-2 flex items-start gap-2">
                    <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden />
                    Tiempo de respuesta habitual: 1–2 días laborables. Asuntos comerciales o
                    multi‑sede: indícalo en el asunto.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
                WhatsApp comercial
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed max-w-md">
                Una línea dedicada de WhatsApp para contacto comercial está{" "}
                <strong className="text-slate-800">en preparación</strong>. Mientras tanto, el correo
                o el formulario nos permiten registrar bien tu caso y responder por escrito con
                claridad.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700 leading-relaxed">
              <strong className="font-semibold text-slate-900">Cuenta ya activa:</strong> usa el canal
              acordado con implantación (correo o referencia de ticket). Esta página atiende consultas
              generales y nuevas solicitudes.
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-emerald-950 leading-relaxed">
              <strong className="font-semibold">¿Quieres entrar en el piloto?</strong> Lo más útil es{" "}
              <Link
                href={cta.primary.href}
                className="font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 rounded"
              >
                {cta.primary.label}
              </Link>{" "}
              con el formulario largo: así evaluamos encaje sin idas y vueltas.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">
              Formulario de contacto
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Cuatro campos. Incluye en el mensaje tipo de locales, volumen aproximado y qué proceso
              queréis abordar primero. Te responderemos con los siguientes pasos por correo.
            </p>
            <RegistrationForm
              fields={contactFormFields}
              submitLabel="Enviar mensaje"
              showTrustFootnote={false}
              successTitle="Mensaje enviado"
              successBody="Gracias. Hemos recibido tu mensaje y lo revisaremos en el orden de entrada."
              successFooter="Si no ves respuesta en 1–2 días laborables, revisa spam o reenvía desde el mismo correo."
              successActionLabel="Enviar otro mensaje"
            />
          </div>
        </div>
      </Section>
    </>
  );
}
