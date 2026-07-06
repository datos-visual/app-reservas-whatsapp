import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="group h-full p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-emerald-200/80 transition duration-200">
      <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center mb-4 ring-1 ring-emerald-100 group-hover:bg-emerald-100/80 transition">
        <Icon className="w-6 h-6 text-emerald-700" aria-hidden />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2 text-base md:text-lg tracking-tight">
        {title}
      </h3>
      <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
