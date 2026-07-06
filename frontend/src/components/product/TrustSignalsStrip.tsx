import {
  MessageCircle,
  Calendar,
  Building2,
  Headphones,
  Layers,
} from "lucide-react";

const items = [
  {
    icon: MessageCircle,
    title: "WhatsApp Cloud API",
    subtitle: "Canal oficial Meta",
  },
  {
    icon: Calendar,
    title: "Google Calendar",
    subtitle: "Disponibilidad y eventos",
  },
  {
    icon: Building2,
    title: "Por sede",
    subtitle: "Configuración por tienda",
  },
  {
    icon: Headphones,
    title: "Implantación guiada",
    subtitle: "Acompañamiento real",
  },
  {
    icon: Layers,
    title: "Multi‑sede",
    subtitle: "Misma lógica, varias ubicaciones",
  },
] as const;

export function TrustSignalsStrip() {
  return (
    <div className="w-full py-2">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {items.map(({ icon: Icon, title, subtitle }) => (
          <li
            key={title}
            className="flex gap-3 rounded-xl border border-slate-200/90 bg-white/80 px-4 py-3 shadow-sm ring-1 ring-slate-100"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
