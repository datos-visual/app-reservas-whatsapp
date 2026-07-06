import { Fragment } from "react";
import { Calendar, CheckCircle2, MessageCircle, Save, Search, UserCheck } from "lucide-react";

const steps = [
  {
    title: "Cliente escribe",
    subtitle: "por WhatsApp",
    Icon: MessageCircle,
  },
  {
    title: "El sistema consulta",
    subtitle: "disponibilidad",
    Icon: Search,
  },
  {
    title: "Se propone",
    subtitle: "un hueco",
    Icon: Calendar,
  },
  {
    title: "El cliente",
    subtitle: "confirma",
    Icon: UserCheck,
  },
  {
    title: "Se registra",
    subtitle: "la reserva",
    Icon: Save,
  },
  {
    title: "Sincronización",
    subtitle: "Google Calendar",
    Icon: CheckCircle2,
  },
] as const;

/**
 * Flujo principal en 6 pasos · escaneable · sin infografía recargada.
 */
export function ReservationFlowDiagram() {
  return (
    <div className="w-full" aria-label="Flujo de reserva en seis pasos">
      <div className="flex flex-col items-stretch gap-1 md:flex-row md:flex-wrap md:justify-center md:gap-0 md:items-start">
        {steps.map((step, i) => {
          const Icon = step.Icon;
          return (
            <Fragment key={step.title}>
              <div className="w-full md:w-[7.5rem] md:shrink-0 flex flex-col">
                <div className="flex min-h-[5.5rem] flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm ring-1 ring-slate-100">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-800">
                    <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </div>
                  <p className="text-xs font-semibold leading-tight text-slate-900">{step.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{step.subtitle}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  className="flex justify-center py-1 text-slate-300 md:w-6 md:items-center md:justify-center md:self-stretch md:py-0"
                  aria-hidden
                >
                  <span className="text-lg font-light leading-none md:hidden">↓</span>
                  <span className="hidden text-base font-light leading-none md:inline">→</span>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
