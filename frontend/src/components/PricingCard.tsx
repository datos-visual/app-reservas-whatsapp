import { Check } from "lucide-react";
import Link from "next/link";

export interface PricingPlan {
  name: string;
  price: string;
  priceCaption?: string;
  description: string;
  /** Una línea tipo “Ideal para…” */
  idealFor?: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  highlighted?: boolean;
  badge?: string;
}

interface PricingCardProps {
  plan: PricingPlan;
}

export function PricingCard({ plan }: PricingCardProps) {
  return (
    <div
      className={`relative rounded-xl border transition flex flex-col h-full ${
        plan.highlighted
          ? "bg-gradient-to-b from-emerald-50/90 to-white border-emerald-300 shadow-md ring-1 ring-emerald-100 md:scale-[1.02]"
          : "bg-white border-slate-200 hover:shadow-md hover:border-slate-300"
      }`}
    >
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-emerald-700 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
            {plan.badge}
          </span>
        </div>
      )}

      <div className="p-6 md:p-8 flex flex-col flex-1">
        <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2 tracking-tight">
          {plan.name}
        </h3>
        {plan.idealFor && (
          <p className="text-sm font-medium text-emerald-900/90 mb-2 leading-snug">{plan.idealFor}</p>
        )}
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">{plan.description}</p>

        <div className="mb-6">
          <span className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            {plan.price}
          </span>
          {plan.priceCaption ? (
            <span className="text-slate-600 ml-2 text-base font-medium">{plan.priceCaption}</span>
          ) : null}
        </div>

        <Link
          href={plan.ctaHref || "/registro"}
          className={`w-full py-3 rounded-lg font-semibold transition text-center block mb-6 min-h-[48px] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
            plan.highlighted
              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              : "bg-slate-100 text-slate-900 hover:bg-slate-200"
          }`}
        >
          {plan.cta}
        </Link>

        <ul className="space-y-3 mt-auto">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden />
              <span className="text-slate-700 text-sm leading-relaxed">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
