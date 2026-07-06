interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <details
          key={index}
          className="group border border-slate-200 rounded-xl bg-white p-5 md:p-6 cursor-pointer hover:border-slate-300 hover:bg-slate-50/80 transition open:shadow-sm"
        >
          <summary className="font-semibold text-slate-900 flex justify-between items-start gap-4 list-none [&::-webkit-details-marker]:hidden cursor-pointer rounded-lg -m-1 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
            <span className="text-left">{item.question}</span>
            <span
              className="text-emerald-700 text-xl font-light leading-none shrink-0 tabular-nums group-open:rotate-45 transition-transform"
              aria-hidden
            >
              +
            </span>
          </summary>
          <p className="text-slate-600 mt-4 text-sm md:text-base leading-relaxed border-t border-slate-100 pt-4">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
