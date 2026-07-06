import { Building2, Calendar, Clock, MessageCircle, User } from "lucide-react";

const rows: { label: string; value: string }[] = [
  { label: "Cliente", value: "Laura Gómez" },
  { label: "Servicio", value: "Consulta inicial" },
  { label: "Fecha", value: "20 abril 2026" },
  { label: "Hora", value: "10:00" },
  { label: "Canal", value: "WhatsApp" },
  { label: "Calendario", value: "Sincronizado" },
  { label: "Sede", value: "Centro" },
];

/**
 * Ficha de detalle de una reserva confirmada (mock).
 */
export function ConfirmedReservationPreview() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md ring-1 ring-slate-100">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Detalle de reserva
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900 tracking-tight">
              Reserva confirmada
            </h3>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
            Confirmada
          </span>
        </div>

        <dl className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
            >
              <dt className="text-xs font-medium text-slate-500 shrink-0">{row.label}</dt>
              <dd className="text-sm font-medium text-slate-900 text-right">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <p>
            <span className="font-semibold text-slate-800">Estado:</span> la cita figura en el panel y
            en Google Calendar de la sede (vista ilustrativa).
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" aria-hidden />
            Ficha interna
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Origen conversación
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Duración según reglas
          </span>
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Por sede
          </span>
        </div>
      </div>
    </div>
  );
}
