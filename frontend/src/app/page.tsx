import Link from "next/link";
import {
  MessageCircle,
  Calendar,
  CheckCircle2,
  Users,
  Building2,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";
import { HeroSection } from "@/components/HeroSection";
import { Section } from "@/components/Section";
import { FeatureCard } from "@/components/FeatureCard";
import { FAQ } from "@/components/FAQ";
import { ProductPreviewSection } from "@/components/product/ProductPreviewSection";
import { ProductDashboardMockup } from "@/components/product/ProductDashboardMockup";
import { WhatsAppConversationMockup } from "@/components/product/WhatsAppConversationMockup";
import { ReservationFlowDiagram } from "@/components/product/ReservationFlowDiagram";
import { ConfirmedReservationPreview } from "@/components/product/ConfirmedReservationPreview";
import { TrustSignalsStrip } from "@/components/product/TrustSignalsStrip";
import { cta } from "@/lib/cta";

export default function Home() {
  const features = [
    {
      icon: MessageCircle,
      title: "Reservas por WhatsApp",
      description:
        "Automatiza el ida y vuelta de la reserva en el canal que ya usan tus clientes, con reglas y trazabilidad por sede.",
    },
    {
      icon: Calendar,
      title: "Disponibilidad real",
      description:
        "Consulta huecos según calendario y servicios; el cliente ve opciones concretas, no promesas vacías.",
    },
    {
      icon: CheckCircle2,
      title: "Confirmación y registro",
      description:
        "La cita queda confirmada y registrada; el equipo ve el estado sin depender de capturas o chats sueltos.",
    },
    {
      icon: Users,
      title: "Operación por sede",
      description:
        "Una o varias ubicaciones: horarios, servicios y calendario alineados con cómo trabajas en cada tienda.",
    },
    {
      icon: Building2,
      title: "Implantación guiada",
      description:
        "Acceso inicial acotado: revisamos solicitudes y acompañamos la configuración antes de abrir tráfico real.",
    },
    {
      icon: LayoutDashboard,
      title: "Panel operativo",
      description:
        "Visibilidad de reservas y conversaciones por sede; complementa tu CRM o herramientas actuales.",
    },
  ];

  const useCases = [
    {
      title: "Peluquerías y salones",
      description: "Citas de corte, coloración y tratamientos con duraciones claras.",
    },
    {
      title: "Clínicas y consultorios",
      description: "Citas por especialidad con mensajes consistentes y confirmación explícita.",
    },
    {
      title: "Centros de estética",
      description: "Reservas por cabinas o profesionales, con control de solapamientos.",
    },
    {
      title: "Restaurantes",
      description: "Reservas de mesa u horarios de servicio sin saturar el teléfono.",
    },
    {
      title: "Comercios con atención por WhatsApp",
      description: "Citas para recogida, prueba o asesoramiento en tienda.",
    },
    {
      title: "Servicios con agenda",
      description: "Clases, talleres o asesorías donde la agenda es el núcleo del negocio.",
    },
  ];

  const practiceSteps = [
    {
      step: "Paso 1",
      title: "El cliente escribe en WhatsApp",
      text: "Pide cita o disponibilidad en el mismo hilo que ya usa con tu negocio.",
      outcome: "Menos llamadas perdidas y menos idas y venidas manuales.",
      icon: MessageCircle,
    },
    {
      step: "Paso 2",
      title: "Se cruza disponibilidad",
      text: "El sistema aplica horarios, servicios y reglas por sede antes de ofrecer huecos.",
      outcome: "Propuestas alineadas con tu agenda real, no con suposiciones.",
      icon: Calendar,
    },
    {
      step: "Paso 3",
      title: "Confirmación explícita",
      text: "El cliente confirma y la reserva queda registrada para ambas partes.",
      outcome: "Menos confusiones y menos ausencias por falta de confirmación.",
      icon: CheckCircle2,
    },
    {
      step: "Paso 4",
      title: "Sincronización en calendario",
      text: "El evento se refleja en Google Calendar según la configuración de la sede.",
      outcome: "Equipo y sede mirando la misma verdad operativa.",
      icon: Calendar,
    },
  ];

  const faqItems = [
    {
      question: "¿Cómo se conecta WhatsApp?",
      answer:
        "Con WhatsApp Cloud API (Meta): canal oficial, trazable y alineado con las políticas del proveedor. Necesitas cuenta de negocio en Meta y un número apto para la API; te guiamos en la implantación.",
    },
    {
      question: "¿Tengo que cambiar mi número de WhatsApp?",
      answer:
        "No necesariamente. Puedes usar un número existente o uno dedicado al negocio; la decisión depende de tu operación y de las políticas de Meta.",
    },
    {
      question: "¿Cómo funciona la sincronización con Google Calendar?",
      answer:
        "Tras autorizar el acceso, el sistema consulta disponibilidad y refleja las citas confirmadas en el calendario que elijas, para mantener al equipo alineado.",
    },
    {
      question: "¿Qué velocidad de respuesta puede esperar el cliente?",
      answer:
        "El flujo está pensado para respuestas inmediatas en la conversación: disponibilidad, confirmación y registro sin esperas largas para quien escribe.",
    },
    {
      question: "¿Cómo se tratan los datos de mis clientes?",
      answer:
        "Aplicamos buenas prácticas de seguridad (cifrado en tránsito, controles de acceso y proveedores con estándares reconocidos). El detalle figura en la política de privacidad.",
    },
    {
      question: "¿Sirve para varias sedes?",
      answer:
        "Sí. Puedes configurar por ubicación: calendarios, reglas y visibilidad coherentes con una o varias tiendas.",
    },
  ];

  return (
    <>
      <HeroSection
        eyebrow="Software multi‑sede · WhatsApp Cloud API · Google Calendar"
        title="Automatiza reservas por WhatsApp sin perder el control de la agenda"
        subtitle="Para peluquerías, clínicas, estética, restaurantes y cualquier negocio que vive de la cita: tu cliente escribe en WhatsApp, el sistema consulta disponibilidad, confirma la cita y la sincroniza con Google Calendar —con una configuración seria por sede."
        primaryCTA={{ text: cta.primary.label, href: cta.primary.href }}
        secondaryCTA={{ text: cta.secondary.label, href: cta.secondary.href }}
      />

      <ProductPreviewSection
        title="Vista del panel"
        subtitle="Una herramienta de operación diaria: KPIs ligeros, agenda, conversaciones y sedes —sin parecer un ERP."
        className="bg-white border-b border-slate-100"
        maxWidthClass="max-w-6xl"
      >
        <ProductDashboardMockup />
      </ProductPreviewSection>

      <section className="border-b border-slate-100 bg-slate-50/50 py-10 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500 mb-6">
            Por qué confiar en el enfoque
          </p>
          <TrustSignalsStrip />
        </div>
      </section>

      <ProductPreviewSection
        title="Así funciona en la práctica"
        subtitle="Conversación realista y flujo en seis pasos: de la primera pregunta del cliente al calendario."
        className="bg-slate-50/80"
        maxWidthClass="max-w-7xl"
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-14 lg:items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">
              Conversación con el cliente
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed max-w-md">
              Propuesta de huecos, confirmación explícita y cierre sincronizado con el calendario.
            </p>
            <WhatsAppConversationMockup />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2 tracking-tight">
              Flujo en el producto
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed max-w-xl">
              Seis pasos escaneables: de la entrada por WhatsApp al registro y la sincronización con
              Google Calendar.
            </p>
            <ReservationFlowDiagram />
          </div>
        </div>
      </ProductPreviewSection>

      <ProductPreviewSection
        title="Resultado operativo"
        subtitle="Así se ve una reserva confirmada en el sistema: datos claros, estado y sede."
        className="bg-white border-b border-slate-100"
        maxWidthClass="max-w-6xl"
      >
        <ConfirmedReservationPreview />
      </ProductPreviewSection>

      <Section
        title="Qué resuelve para tu negocio"
        subtitle="Menos fricción operativa y más claridad para el cliente: un único hilo de reserva con reglas que tú defines."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </Section>

      <Section
        className="bg-slate-50"
        title="Para qué negocios está pensado"
        subtitle="Desde un solo local hasta varias sedes: el mismo criterio de reserva, adaptado a tu tipo de servicio."
        centered={false}
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {useCases.map((useCase, index) => (
            <div
              key={index}
              className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition duration-200"
            >
              <h3 className="font-semibold text-slate-900 mb-2 tracking-tight">{useCase.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{useCase.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Cuatro movimientos en el día a día"
        subtitle="Lo que percibe el cliente como una conversación; detrás, reglas y calendario alineados."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5">
          {practiceSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.step}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100 flex flex-col h-full"
              >
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4 ring-4 ring-emerald-50">
                  <Icon className="w-6 h-6 text-emerald-700" aria-hidden />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 mb-1">
                  {step.step}
                </p>
                <h3 className="font-semibold text-slate-900 mb-2 leading-snug">{step.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-3 flex-1">{step.text}</p>
                <p className="text-xs font-medium text-slate-700 border-t border-slate-100 pt-3 leading-snug">
                  <span className="text-emerald-800">Resultado:</span> {step.outcome}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <section className="py-14 md:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 border-y border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 md:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
              Integraciones previstas
            </h2>
            <p className="text-slate-600 leading-relaxed text-base md:text-lg">
              Arquitectura alineada con los canales oficiales que ya utilizan Meta y Google.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-4 sm:gap-3 flex-wrap mb-8">
            <div className="px-5 py-3 bg-white rounded-xl shadow-sm border border-slate-200 font-semibold text-slate-900 flex items-center justify-center gap-2 min-h-[52px]">
              <MessageCircle className="w-5 h-5 text-emerald-600" aria-hidden />
              WhatsApp Cloud API
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 hidden sm:block shrink-0" aria-hidden />
            <div className="px-5 py-3 bg-white rounded-xl shadow-sm border border-slate-200 font-semibold text-slate-900 flex items-center justify-center gap-2 min-h-[52px]">
              <Calendar className="w-5 h-5 text-blue-600" aria-hidden />
              Google Calendar
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 hidden sm:block shrink-0" aria-hidden />
            <div className="px-5 py-3 bg-white rounded-xl shadow-sm border border-slate-200 font-semibold text-slate-900 flex items-center justify-center gap-2 min-h-[52px]">
              <LayoutDashboard className="w-5 h-5 text-violet-600" aria-hidden />
              Panel por sede
            </div>
          </div>
          <p className="text-slate-600 max-w-2xl mx-auto text-center text-sm md:text-base leading-relaxed">
            La conversación en WhatsApp, la verdad operativa en el calendario y la trazabilidad en un
            panel por tienda: tres piezas conectadas con criterio B2B.
          </p>
        </div>
      </section>

      <Section
        title="Preguntas frecuentes"
        subtitle="Transparencia sobre el canal, el calendario y el alcance multi‑sede."
      >
        <div className="max-w-3xl mx-auto">
          <FAQ items={faqItems} />
        </div>
      </Section>

      <section className="py-14 md:py-20 px-4 sm:px-6 lg:px-8 bg-emerald-700 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight text-white">
              ¿Encaja con tu operación?
            </h2>
            <p className="text-base md:text-lg text-emerald-50 mb-8 leading-relaxed">
              Solicita acceso inicial. Revisamos cada solicitud para coordinar configuración, permisos y
              un despliegue guiado acorde a tus sedes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center">
              <Link
                href={cta.primary.href}
                className="inline-flex justify-center items-center px-8 py-3.5 bg-white text-emerald-900 font-semibold rounded-lg shadow-md hover:bg-emerald-50 transition min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {cta.primary.label}
              </Link>
              <Link
                href={cta.secondary.href}
                className="inline-flex justify-center items-center px-8 py-3.5 rounded-lg border border-emerald-200/80 text-white font-semibold hover:bg-emerald-600/80 transition min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {cta.secondary.label}
              </Link>
            </div>
            <p className="mt-6 text-sm text-emerald-100/90">
              ¿Dudas antes de solicitar acceso?{" "}
              <Link
                href={cta.talk.href}
                className="font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded"
              >
                {cta.talk.label}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
