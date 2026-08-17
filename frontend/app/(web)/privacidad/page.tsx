import type { Metadata } from "next";
import { Section } from "@/components/Section";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Política de privacidad de ${site.name}. Información sobre tratamiento de datos personales y responsabilidades del responsable del tratamiento.`,
};

export default function Privacidad() {
  return (
    <>
      <Section
        title="Política de privacidad"
        subtitle="Documento orientativo para una fase inicial de producto; revísalo con asesoramiento legal si tu operación lo requiere."
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
                1. Introducción
              </h2>
              <p>
                {site.name} («nosotros») pone a disposición este sitio web y el software de reservas por
                WhatsApp descrito en la documentación pública. Este texto resume cómo tratamos la
                información personal asociada a visitantes del sitio y usuarios del servicio.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                2. Recopilación de Datos
              </h2>
              <p>
                Recopilamos diferentes tipos de información para diversos propósitos con el fin de
                prestar un servicio mejor a nuestros usuarios:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Datos identificativos y de contacto profesional (nombre, correo, teléfono)</li>
                <li>Datos del negocio (razón social o nombre comercial, ubicación, sector)</li>
                <li>Datos de cuenta y autenticación cuando exista producto activo</li>
                <li>Datos de uso del servicio (registros técnicos, interacción con funciones)</li>
                <li>Datos de los clientes finales de tu negocio cuando los introduces en la plataforma</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                3. Uso de Datos
              </h2>
              <p>
                Usamos la información recopilada para:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Proporcionar, mantener y mejorar nuestro servicio</li>
                <li>Procesar transacciones y enviar información relacionada</li>
                <li>Enviarte comunicaciones relevantes sobre el servicio (y, si lo autorizas, información comercial)</li>
                <li>Responder a tus comentarios, preguntas y solicitudes de servicio</li>
                <li>Monitorear y analizar tendencias, uso y actividades</li>
                <li>Cumplir con obligaciones legales</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                4. Seguridad de Datos
              </h2>
              <p>
                La seguridad de tus datos es importante para nosotros pero recuerda que ningún método
                de transmisión por Internet o método de almacenamiento electrónico es 100% seguro.
                Mientras nos esforzamos por usar medios comercialmente aceptables para proteger tus
                datos personales, no podemos garantizar su seguridad absoluta.
              </p>
              <p className="mt-4">
                Implementamos:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Cifrado TLS en la comunicación con el sitio y las APIs expuestas</li>
                <li>Controles de acceso internos y segregación de entornos cuando aplique</li>
                <li>Copias de seguridad y medidas de continuidad acordes al proveedor de infraestructura</li>
                <li>Revisión periódica de permisos sobre datos personales</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                5. Datos de Clientes
              </h2>
              <p>
                Si usas nuestro servicio, eres responsable de los datos de tus clientes que procesas
                a través de nuestra plataforma. No compartimos estos datos con terceros sin autorización
                expresa. Los datos se procesan únicamente para facilitar las reservas y la comunicación
                con WhatsApp Cloud API de Meta.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                6. Integración con WhatsApp
              </h2>
              <p>
                Cuando conectas tu número de WhatsApp, delegamos la transmisión de mensajes a Meta.
                Meta recopila datos según su propia política de privacidad. Recomendamos revisar la
                política de WhatsApp para entender cómo trata tus datos.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                7. Cookies
              </h2>
              <p>
                Usamos cookies para mejorar tu experiencia. Puedes instruir a tu navegador para que
                rechace las cookies, pero algunos elementos de nuestro sitio pueden no funcionar correctamente.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                8. Tus Derechos
              </h2>
              <p>
                Tienes derecho a:
              </p>
              <ul className="list-disc list-inside space-y-2 mt-2">
                <li>Acceder a tus datos personales</li>
                <li>Corregir datos inexactos</li>
                <li>Solicitar la eliminación de tus datos</li>
                <li>Optar por no recibir comunicaciones de marketing</li>
                <li>Solicitar portabilidad de datos</li>
              </ul>
              <p className="mt-4">
                Para ejercer estos derechos, escribe a{" "}
                <a href={`mailto:${site.contactEmail}`} className="text-emerald-700 font-semibold hover:underline">
                  {site.contactEmail}
                </a>
                .
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                9. Cambios a esta Política
              </h2>
              <p>
                Podemos actualizar esta política de privacidad de vez en cuando. Te notificaremos
                sobre cualquier cambio publicando la nueva política en esta página.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                10. Contacto
              </h2>
              <p>
                Para cualquier cuestión sobre privacidad, contáctanos en{" "}
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
