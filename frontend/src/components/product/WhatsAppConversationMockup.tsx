import type { ReactNode } from "react";

type Bubble = {
  role: "client" | "business";
  content: ReactNode;
  time?: string;
};

const thread: Bubble[] = [
  {
    role: "client",
    content: "Hola, quiero reservar para mañana",
    time: "10:41",
  },
  {
    role: "business",
    content: (
      <>
        <p className="mb-2">Claro. Estos son los huecos disponibles:</p>
        <ul className="list-disc pl-4 space-y-0.5 text-sm">
          <li>10:00</li>
          <li>11:30</li>
          <li>17:00</li>
        </ul>
      </>
    ),
    time: "10:41",
  },
  { role: "client", content: "10:00", time: "10:42" },
  {
    role: "business",
    content: "Perfecto. ¿Confirmas la cita para el 20 de abril a las 10:00?",
    time: "10:42",
  },
  { role: "client", content: "Sí", time: "10:42" },
  {
    role: "business",
    content: "Tu reserva ha quedado confirmada y sincronizada con el calendario.",
    time: "10:42",
  },
];

/**
 * Conversación de ejemplo (inspiración general en chat; no es la UI de WhatsApp).
 */
export function WhatsAppConversationMockup() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-slate-100/90 p-3 shadow-lg ring-1 ring-slate-200/80">
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200/60 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-800 px-4 py-3 text-white">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Reserva por mensajería</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Cliente</p>
                <p className="text-xs text-emerald-300/90">Canal activo</p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                En línea
              </span>
            </div>
          </div>

          <div className="space-y-3 bg-gradient-to-b from-slate-50 to-white px-3 py-4">
            {thread.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "client" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    m.role === "client"
                      ? "rounded-br-md bg-emerald-600 text-white"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  {m.content}
                  {m.time && (
                    <p
                      className={`mt-2 text-[10px] tabular-nums ${
                        m.role === "client" ? "text-emerald-100/90" : "text-slate-400"
                      }`}
                    >
                      {m.time}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-500">Ejemplo ilustrativo</p>
      </div>
    </div>
  );
}
