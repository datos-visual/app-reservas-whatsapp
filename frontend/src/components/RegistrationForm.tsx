"use client";

import { useState, FormEvent, ChangeEvent, Fragment } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle } from "lucide-react";

export interface FormFieldProps {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  hint?: string;
}

export interface FormFieldGroup {
  title: string;
  description?: string;
  fields: FormFieldProps[];
}

interface RegistrationFormProps {
  fields?: FormFieldProps[];
  groups?: FormFieldGroup[];
  onSubmit?: (data: Record<string, string>) => Promise<void>;
  submitLabel?: string;
  successTitle?: string;
  successBody?: string;
  successFooter?: string;
  successActionLabel?: string;
  /** Microcopy bajo los campos (p. ej. confianza). Ocultar en formularios cortos como contacto. */
  showTrustFootnote?: boolean;
}

export function RegistrationForm({
  fields = [],
  groups,
  onSubmit,
  submitLabel = "Enviar solicitud",
  successTitle = "Solicitud recibida",
  successBody = "Gracias. Hemos registrado tus datos. Revisamos cada solicitud antes de activar el acceso inicial y coordinar la implantación guiada.",
  successFooter = "Revisa tu correo (incluida la carpeta de spam) por si enviamos un acuse o pedimos un dato adicional.",
  successActionLabel = "Enviar otra solicitud",
  showTrustFootnote = true,
}: RegistrationFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const allFields: FormFieldProps[] = groups ? groups.flatMap((g) => g.fields) : fields;

  const clearFieldError = (name: string) => {
    setFieldErrors((prev: Record<string, string>) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    for (const field of allFields) {
      if (field.type === "checkbox") {
        if (field.required && formData[field.name] !== "true") {
          errors[field.name] = "Debes aceptar esta casilla para enviar el formulario.";
        }
        continue;
      }

      const raw = formData[field.name] ?? "";
      const val = raw.trim();

      if (field.required && !val) {
        errors[field.name] = "Este campo es obligatorio.";
        continue;
      }

      if (field.type === "email" && val) {
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        if (!ok) errors[field.name] = "Introduce un correo electrónico válido.";
      }

      if (field.type === "tel" && val) {
        const digits = val.replace(/\D/g, "");
        if (digits.length < 8) {
          errors[field.name] = "Introduce un teléfono de contacto con suficientes dígitos.";
        }
      }

      if (field.type === "url" && val) {
        let urlOk = false;
        try {
          urlOk = Boolean(new URL(val));
        } catch {
          urlOk = false;
        }
        if (!urlOk) {
          errors[field.name] = "Introduce una URL válida (incluye https://).";
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setFormData((prev: Record<string, string>) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked ? "true" : "false",
      }));
    } else {
      setFormData((prev: Record<string, string>) => ({
        ...prev,
        [name]: value,
      }));
    }
    clearFieldError(name);
  };

  const fieldClass = (name: string) =>
    `w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition text-slate-900 placeholder:text-slate-400 ${
      fieldErrors[name]
        ? "border-red-400 focus:ring-red-200 bg-red-50/40"
        : "border-slate-300 focus:ring-emerald-500/35 focus:border-emerald-600"
    }`;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);

    try {
      if (onSubmit) {
        await onSubmit(formData);
      }
      setSubmitted(true);
      setFormData({});
      setFieldErrors({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el formulario. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: FormFieldProps) => {
    if (field.type === "checkbox") {
      return (
        <div key={field.name} className="pt-1">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name={field.name}
              checked={formData[field.name] === "true"}
              onChange={handleChange}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0"
            />
            <span className="text-sm text-slate-800 leading-snug">{field.label}</span>
          </label>
          {field.name === "terminos" && (
            <p className="text-xs text-slate-500 mt-2 ml-7">
              <Link href="/terminos" className="text-emerald-800 hover:underline font-medium">
                Términos del servicio
              </Link>
              <span className="mx-1.5 text-slate-300">·</span>
              <Link href="/privacidad" className="text-emerald-800 hover:underline font-medium">
                Política de privacidad
              </Link>
            </p>
          )}
          {fieldErrors[field.name] && (
            <p className="text-red-600 text-sm mt-2" role="alert">
              {fieldErrors[field.name]}
            </p>
          )}
        </div>
      );
    }

    return (
      <div key={field.name}>
        <label htmlFor={field.name} className="block text-sm font-semibold text-slate-900 mb-2">
          {field.label}
          {field.required && (
            <span className="text-red-500 font-normal ml-0.5" aria-hidden>
              *
            </span>
          )}
        </label>

        {field.type === "select" && field.options ? (
          <select
            id={field.name}
            name={field.name}
            value={formData[field.name] || ""}
            onChange={handleChange}
            required={false}
            aria-invalid={!!fieldErrors[field.name]}
            aria-describedby={field.hint ? `${field.name}-hint` : undefined}
            className={fieldClass(field.name)}
          >
            <option value="">Seleccione una opción</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea
            id={field.name}
            name={field.name}
            value={formData[field.name] || ""}
            onChange={handleChange}
            placeholder={field.placeholder}
            required={false}
            rows={4}
            aria-invalid={!!fieldErrors[field.name]}
            aria-describedby={field.hint ? `${field.name}-hint` : undefined}
            className={fieldClass(field.name)}
          />
        ) : (
          <input
            id={field.name}
            type={field.type || "text"}
            name={field.name}
            value={formData[field.name] || ""}
            onChange={handleChange}
            placeholder={field.placeholder}
            required={false}
            aria-invalid={!!fieldErrors[field.name]}
            aria-describedby={field.hint ? `${field.name}-hint` : undefined}
            className={fieldClass(field.name)}
          />
        )}

        {field.hint && !fieldErrors[field.name] && (
          <p id={`${field.name}-hint`} className="text-xs text-slate-500 mt-1.5">
            {field.hint}
          </p>
        )}
        {fieldErrors[field.name] && (
          <p className="text-red-600 text-sm mt-1.5" role="alert">
            {fieldErrors[field.name]}
          </p>
        )}
      </div>
    );
  };

  if (submitted) {
    return (
      <div
        className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 md:p-10 text-center shadow-sm"
        role="status"
      >
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-12 h-12 text-emerald-700" aria-hidden />
        </div>
        <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">{successTitle}</h3>
        <p className="text-slate-600 mb-2 max-w-md mx-auto leading-relaxed">{successBody}</p>
        <p className="text-sm text-slate-500 mb-8 max-w-md mx-auto">{successFooter}</p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="text-emerald-800 font-semibold hover:text-emerald-950 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 rounded"
        >
          {successActionLabel}
        </button>
      </div>
    );
  }

  const formBody = groups ? (
    <div className="space-y-10">
      {groups.map((group, gi) => (
        <section key={`${group.title}-${gi}`} className="space-y-5">
          {gi > 0 && <div className="border-t border-slate-100 pt-8" aria-hidden />}
          {group.title ? (
            <header>
              <h4 className="text-base font-bold text-slate-900 tracking-tight">{group.title}</h4>
              {group.description ? (
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{group.description}</p>
              ) : null}
            </header>
          ) : null}
          <div className="space-y-5">{group.fields.map((f) => renderField(f))}</div>
        </section>
      ))}
    </div>
  ) : (
    <div className="space-y-5">{fields.map((f) => renderField(f))}</div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-red-800 text-sm leading-relaxed">{error}</p>
        </div>
      )}

      {formBody}

      {showTrustFootnote ? (
        <p className="text-xs text-slate-500 leading-relaxed -mt-2">
          Durante esta fase la implantación es guiada. Revisamos cada envío antes de activar el acceso
          cuando aplique; te responderemos con los siguientes pasos por correo.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition shadow-sm disabled:opacity-55 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 min-h-[48px]"
      >
        {loading ? "Enviando…" : submitLabel}
      </button>
    </form>
  );
}
