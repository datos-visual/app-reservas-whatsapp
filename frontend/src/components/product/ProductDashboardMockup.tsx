import { Building2, Calendar, ChevronDown, LayoutGrid, MessageSquare } from "lucide-react";

const kpis = [
  { label: "Reservas hoy", value: "12", hint: "en todas las sedes" },
  { label: "Pendientes", value: "3", hint: "pendientes de confirmar" },
  { label: "Confirmadas", value: "9", hint: "ya en agenda" },
] as const;

const upcoming = [
  { name: "Laura Gómez", time: "10:00", status: "Confirmada" as const },
  { name: "Carlos Ruiz", time: "11:30", status: "Pendiente" as const },
];

const chats = [
  { preview: "Hola, quiero reservar para mañana", time: "10:42" },
  { preview: "¿Tenéis hueco a las 17:00?", time: "10:38" },
];

/**
 * Mockup sobrio del panel operativo (solo UI, sin lógica).
 */
export function ProductDashboardMockup() {
  return (
    <div
      className="rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/40 overflow-hidden ring-1 ring-slate-100"
      aria-label="Vista previa del panel CanalAgenda"
    >
      {/* Cabecera */}
      <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">CanalAgenda</p>
            <p className="text-xs text-slate-500 truncate">Panel · operación diaria</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Tienda Centro
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          </button>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
            <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Hoy
          </span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="border-b border-slate-100 bg-white lg:w-48 lg:border-b-0 lg:border-r lg:border-slate-100">
          <nav className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-col lg:px-3 lg:py-4">
            {[
              { label: "Resumen", active: true },
              { label: "Reservas", active: false },
              { label: "Conversaciones", active: false },
              { label: "Sedes", active: false },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  item.active
                    ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Contenido */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 shadow-sm"
              >
                <p className="text-xs font-medium text-slate-500">{k.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{k.value}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{k.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Próximas reservas */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Próximas reservas</h3>
                <span className="text-[11px] text-slate-400">Agenda del día</span>
              </div>
              <ul className="space-y-2">
                {upcoming.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.time}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        row.status === "Confirmada"
                          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                          : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                      }`}
                    >
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Conversaciones */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Conversaciones recientes</h3>
                <MessageSquare className="h-4 w-4 text-slate-300" aria-hidden />
              </div>
              <ul className="space-y-2">
                {chats.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-700"
                  >
                    <p className="line-clamp-2 leading-snug">&ldquo;{c.preview}&rdquo;</p>
                    <p className="mt-1 text-[11px] text-slate-400">{c.time}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sedes + huecos */}
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                <Building2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                Tienda Centro
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                Tienda Norte
              </span>
            </div>
            <p className="text-xs text-slate-500 sm:text-right">
              Próximos huecos: <span className="font-medium text-slate-700">12:00 · 15:30 · 17:00</span>
            </p>
          </div>

          <p className="text-[11px] text-slate-400">Vista ilustrativa · datos de ejemplo</p>
        </div>
      </div>
    </div>
  );
}
