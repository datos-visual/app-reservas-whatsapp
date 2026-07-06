import type { Metadata } from "next";
import { Section } from "@/components/Section";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Términos del servicio",
  description: `Condiciones generales de uso del software ${site.name} para reservas por WhatsApp y servicios asociados.`,
};

export default function Terminos() {
  return (
    <>
      <Section
        title="Términos del servicio"
        subtitle="Marco contractual orientativo para una fase inicial de producto. Para acuerdos específicos se podrán firmar anexos comerciales."
        containerClassName="max-w-3xl"
        centered={false}
      >
        <div className="prose prose-sm max-w-none">
          <div className="space-y-6 text-gray-700 leading-relaxed">
            <p className="text-sm text-gray-600">
              Última actualización: Abril de 2026
            </p>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                1. Aceptación de Términos
              </h2>
              <p>
                Al acceder o utilizar {site.name}, aceptas quedar vinculado por estos términos. Si no estás
                de acuerdo, debes abstenerte de usar el servicio.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                2. Descripción del Servicio
              </h2>
              <p>
                {site.name} es una plataforma SaaS que permite a negocios recibir y gestionar reservas por
                WhatsApp, con sincronización hacia Google Calendar cuando corresponda. El servicio puede
                incluir, según el alcance contratado:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Integración con WhatsApp Cloud API</li>
                <li>Sincronización con Google Calendar</li>
                <li>Panel de control para gestionar reservas</li>
                <li>Historial de conversaciones</li>
                <li>Soporte técnico según tu plan</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                3. Requisitos de Cuenta
              </h2>
              <p>
                Para usar nuestro servicio, debes:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Ser mayor de 18 años o tener consentimiento de un adulto</li>
                <li>Ser responsable de un negocio o representarlo legalmente</li>
                <li>Proporcionar información exacta y completa en el registro</li>
                <li>Cumplir con todas las leyes y regulaciones aplicables</li>
                <li>Poseer una cuenta comercial en Meta para WhatsApp</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                4. Responsabilidades del Usuario
              </h2>
              <p>
                Al usar nuestro servicio, aceptas:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>No usar el servicio para actividades ilegales o fraudulentas</li>
                <li>No enviar spam o mensajes no autorizados a través de WhatsApp</li>
                <li>Cumplir con la política de privacidad de Meta y WhatsApp</li>
                <li>Ser responsable del contenido que transmites</li>
                <li>Proteger la confidencialidad de tus credenciales de cuenta</li>
                <li>Incluir información clara de contacto en tus mensajes</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                5. Datos de Clientes
              </h2>
              <p>
                Eres responsable de obtener consentimiento informado de tus clientes para recopilar
                y procesar sus datos a través de nuestro servicio. Debes cumplir con GDPR y leyes
                de privacidad aplicables en tu jurisdicción.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                6. Limitaciones de Responsabilidad
              </h2>
              <p>
                EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, {site.name.toUpperCase()} NO SERÁ
                RESPONSABLE POR:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Daños indirectos, incidentales, especiales o consecuentes</li>
                <li>Pérdida de datos, ingresos o ganancias</li>
                <li>Interrupciones del servicio causadas por terceros (Meta, Google)</li>
                <li>Problemas técnicos fuera de nuestro control</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                7. Disponibilidad del Servicio
              </h2>
              <p>
                Objetivo de alta disponibilidad razonable para un servicio en evolución. No obstante, no
                garantizamos un servicio ininterrumpido. Podemos programar ventanas de mantenimiento o
                suspender el acceso si es necesario por seguridad, incumplimiento o requerimiento legal.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                8. Pago y Facturación
              </h2>
              <p>
                Al suscribirte a un plan, aceptas:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Pagar la tarifa mensual o anual según tu plan</li>
                <li>Proporcionar información de pago válida</li>
                <li>Autorizar los cargos a tu método de pago</li>
                <li>La renovación automática del servicio</li>
              </ul>
              <p className="mt-4">
                Puedes cancelar tu suscripción en cualquier momento desde tu panel.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                9. Cancelación y Término
              </h2>
              <p>
                Podemos cancelar o suspender tu cuenta si:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Violas estos términos</li>
                <li>Usas el servicio para actividades ilegales</li>
                <li>Incumples con pagos por más de 30 días</li>
                <li>Incumples de forma reiterada las políticas de Meta o Google</li>
              </ul>
              <p className="mt-4">
                Tras la cancelación, la conservación o eliminación de datos se regirá por la política de
                privacidad y la normativa aplicable.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                10. Cambios a los Términos
              </h2>
              <p>
                Nos reservamos el derecho de modificar estos términos en cualquier momento.
                Los cambios significativos se comunicarán por email. El uso continuado del servicio
                después de cambios constituye aceptación.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                11. Ley Aplicable
              </h2>
              <p>
                Estos términos se rigen por las leyes del país/jurisdicción del servicio.
                Cualquier disputa se resolverá en los tribunales competentes.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                12. Contacto
              </h2>
              <p>
                Para consultas sobre estos términos, escribe a{" "}
                <a href={`mailto:${site.contactEmail}`} className="text-emerald-700 font-semibold hover:underline">
                  {site.contactEmail}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
