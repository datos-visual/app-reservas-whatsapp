'use client';

// REJILLA DE AGENDA — una columna por profesional, el tiempo bajando.
//
// Es la pantalla donde el salón vive ocho horas al día, así que manda una
// regla por encima de la estética: **lo que no se puede vender se ve rayado**.
// Fuera de turno, vacaciones, cerrado o un rato bloqueado se dibujan con la
// misma trama diagonal. Así la dueña deja de preguntarse «¿por qué el
// asistente no ofrece esa hora?» — la respuesta está a la vista.
//
// Y lo que no tiene ninguno de los grandes (Fresha, GlossGenius, Phorest):
// una cita con fases se pinta HUECA por dentro. El bloque ocupa el sillón dos
// horas y media, pero el rato en que la profesional queda libre se ve como una
// banda vacía. Ahí está el dinero que la peluquería no sabía que tenía.
//
// Estructura por tipografía y espacio, líneas al mínimo, color solo donde hay
// que actuar.

import { useEffect, useMemo, useRef, useState } from 'react';
import { aMinutos, aHhmm, ventanaDelDia, franjasFueraDeTurno } from '../lib/rejilla';

type Tramo = { desde: string; hasta: string };
export type CitaRejilla = {
  id: number;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  cliente: string | null;
  telefono: string | null;
  servicio: string | null;
  profesional: string | null;
  resource_id?: number | null;
  tramos?: Tramo[];
  hueco_libre?: { desde: string; hasta: string; minutos: number } | null;
};
export type BloqueoRejilla = { event_id: string; titulo: string; desde: string; hasta: string };
type Turno = { weekday: number; open_time: string; close_time: string };
type Ausencia = { start_date: string; end_date: string; reason: string | null };
export type PersonaRejilla = {
  id: number;
  name: string;
  is_active: boolean;
  turnos?: Turno[];
  ausencias?: Ausencia[];
};

const ALTO_HORA = 64;          // px por hora: 30 min = 32 px, legible y compacto
const TRAMA =
  'repeating-linear-gradient(45deg,#f7f6f2,#f7f6f2 5px,#efede6 5px,#efede6 10px)';

function minutosDeIso(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function RejillaAgenda({
  fecha,
  abre,
  cierra,
  citas,
  bloqueos,
  personas,
  onSeleccionar
}: {
  fecha: string;
  abre: string | null;
  cierra: string | null;
  citas: CitaRejilla[];
  bloqueos: BloqueoRejilla[];
  personas: PersonaRejilla[];
  onSeleccionar?: (c: CitaRejilla) => void;
}) {
  const confirmadas = useMemo(() => citas.filter((c) => c.status === 'confirmed'), [citas]);

  // Ventana de la rejilla: el horario del día, pero ampliada si alguna cita se
  // sale (una cita antigua no puede quedar invisible por un cambio de horario).
  const { inicio, fin } = useMemo(
    () =>
      ventanaDelDia({
        abre,
        cierra,
        minutosCitas: confirmadas.map((c) => ({
          desde: minutosDeIso(c.start_at),
          hasta: minutosDeIso(c.end_at)
        })),
        minutosBloqueos: bloqueos
          .map((b) => ({ desde: aMinutos(b.desde), hasta: aMinutos(b.hasta) }))
          .filter((r): r is { desde: number; hasta: number } => r.desde != null && r.hasta != null)
      }),
    [abre, cierra, confirmadas, bloqueos]
  );

  const alto = ((fin - inicio) / 60) * ALTO_HORA;
  const y = (min: number) => ((min - inicio) / 60) * ALTO_HORA;
  const horas = useMemo(() => {
    const out: number[] = [];
    for (let m = inicio; m <= fin; m += 60) out.push(m);
    return out;
  }, [inicio, fin]);

  const activas = useMemo(() => personas.filter((p) => p.is_active), [personas]);
  const sinAsignar = useMemo(
    () => confirmadas.filter((c) => !c.resource_id),
    [confirmadas]
  );
  // Columnas: el equipo; y una más solo si hay citas sin profesional asignada.
  const columnas = useMemo(
    () => [
      ...activas.map((p) => ({ id: p.id as number | null, nombre: p.name, persona: p })),
      ...(sinAsignar.length ? [{ id: null, nombre: 'Sin asignar', persona: null }] : [])
    ],
    [activas, sinAsignar]
  );

  // En el móvil no caben tres columnas de 60 px: se enseña una y se cambia
  // con las pastillas de arriba (igual que hacen las apps del sector).
  const [movil, setMovil] = useState<number | null>(null);
  useEffect(() => {
    if (columnas.length && movil === null) setMovil(columnas[0].id);
  }, [columnas, movil]);

  // Línea de «ahora», solo si se está mirando el día de hoy
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const calcular = () => {
      const h = new Date();
      const esHoy = h.toISOString().slice(0, 10) === fecha;
      setAhora(esHoy ? h.getHours() * 60 + h.getMinutes() : null);
    };
    calcular();
    const t = setInterval(calcular, 60000);
    return () => clearInterval(t);
  }, [fecha]);

  // Al abrir, dejar la vista cerca de la hora actual (o de la apertura)
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scroller.current) return;
    const objetivo = ahora != null ? y(ahora) - 120 : 0;
    scroller.current.scrollTop = Math.max(0, objetivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  const diaSemana = new Date(fecha + 'T12:00:00').getDay();

  function franjasRayadas(p: PersonaRejilla | null) {
    if (!p) return [];
    return franjasFueraDeTurno({
      turnos: p.turnos,
      ausencias: p.ausencias,
      fecha,
      diaSemana,
      inicio,
      fin
    });
  }

  return (
    <div className="ca-card overflow-hidden">
      {/* Selector de profesional: solo en móvil */}
      {columnas.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-[#f2f1ec] px-3 py-2 sm:hidden">
          {columnas.map((c) => (
            <button
              key={String(c.id)}
              onClick={() => setMovil(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition ${
                movil === c.id ? 'bg-[#1c1917] text-white' : 'bg-[#f2f1ec] text-[#57534e]'
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Cabecera de columnas */}
      <div
        className="grid border-b border-[#f2f1ec]"
        style={{ gridTemplateColumns: `48px repeat(${columnas.length}, minmax(0,1fr))` }}
      >
        <div />
        {columnas.map((c) => {
          const oculta = movil !== c.id;
          return (
            <div
              key={String(c.id)}
              className={`px-2 py-2.5 text-center ${oculta ? 'hidden sm:block' : ''}`}
            >
              <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#f2f1ec] text-[11px] text-[#57534e]">
                {c.nombre.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-[12.5px] text-[#1c1917]">{c.nombre}</span>
            </div>
          );
        })}
      </div>

      {/* Rejilla */}
      <div ref={scroller} className="max-h-[560px] overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `48px repeat(${columnas.length}, minmax(0,1fr))`, height: alto }}
        >
          {/* Raíl de horas */}
          <div className="relative">
            {horas.map((h) => (
              <div
                key={h}
                className="ca-cifras absolute right-2 -translate-y-1/2 text-[10.5px] text-[#a8a29e]"
                style={{ top: y(h) }}
              >
                {h < fin ? aHhmm(h) : ''}
              </div>
            ))}
          </div>

          {columnas.map((col) => {
            const oculta = movil !== col.id;
            const citasCol = confirmadas.filter((c) =>
              col.id === null ? !c.resource_id : c.resource_id === col.id
            );
            return (
              <div
                key={String(col.id)}
                className={`relative border-l border-[#f6f5f1] ${oculta ? 'hidden sm:block' : ''}`}
              >
                {/* Líneas de hora: lo más tenues posible */}
                {horas.slice(1).map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-[#f6f5f1]"
                    style={{ top: y(h) }}
                  />
                ))}

                {/* Rayado: fuera de turno o vacaciones */}
                {franjasRayadas(col.persona).map((f, i) => (
                  <div
                    key={`t${i}`}
                    className="absolute left-0 right-0"
                    style={{ top: y(f.desde), height: y(f.hasta) - y(f.desde), background: TRAMA }}
                    title={f.motivo}
                  />
                ))}

                {/* Rayado: ratos bloqueados (afectan a todo el salón) */}
                {bloqueos.map((b) => {
                  const d = aMinutos(b.desde);
                  const h = aMinutos(b.hasta);
                  if (d == null || h == null) return null;
                  return (
                    <div
                      key={b.event_id + String(col.id)}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded-[10px] border border-[#e2dcd2] px-2 py-1"
                      style={{ top: y(d), height: Math.max(18, y(h) - y(d)), background: TRAMA }}
                    >
                      <span className="text-[10.5px] text-[#57534e]">{b.titulo}</span>
                    </div>
                  );
                })}

                {/* Citas */}
                {citasCol.map((c) => {
                  const d = minutosDeIso(c.start_at);
                  const h = minutosDeIso(c.end_at);
                  const alturaBloque = Math.max(22, y(h) - y(d));
                  const hueco = c.hueco_libre;
                  const hd = aMinutos(hueco?.desde);
                  const hh = aMinutos(hueco?.hasta);

                  return (
                    <button
                      key={c.id}
                      onClick={() => onSeleccionar?.(c)}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded-[10px] border border-[#e2dcd2] bg-[#f4f1ec] px-2 py-1 text-left transition hover:border-[#c9c1b4] focus:outline-none focus:ring-2 focus:ring-[#1c1917]/15"
                      style={{ top: y(d), height: alturaBloque }}
                    >
                      <span className="ca-cifras block text-[10.5px] leading-tight text-[#8a8378]">
                        {aHhmm(d)}
                      </span>
                      <span className="block truncate text-[12px] leading-tight text-[#1c1917]">
                        {c.cliente || 'Sin nombre'}
                      </span>
                      {alturaBloque > 44 && (
                        <span className="block truncate text-[11px] leading-tight text-[#57534e]">
                          {c.servicio}
                        </span>
                      )}

                      {/* El hueco de la espera: la cita se pinta hueca por dentro */}
                      {hueco && hd != null && hh != null && hueco.minutos > 0 && (
                        <span
                          className="absolute left-1 right-1 flex items-center justify-center rounded-[7px] border border-dashed border-[#c2410c] bg-white"
                          style={{ top: y(hd) - y(d), height: Math.max(16, y(hh) - y(hd)) }}
                        >
                          <span className="text-[10px] text-[#9a3412]">libre · {hueco.minutos} min</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Ahora */}
          {ahora != null && ahora >= inicio && ahora <= fin && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
              style={{ top: y(ahora) }}
            >
              <span className="ca-cifras rounded-full bg-[#c2410c] px-1.5 py-0.5 text-[10px] text-white">
                {aHhmm(ahora)}
              </span>
              <span className="h-px flex-1 bg-[#c2410c]" />
            </div>
          )}
        </div>
      </div>

      {/* Leyenda: sin ella, el rayado se lee como «error» */}
      <div className="flex flex-wrap gap-4 border-t border-[#f2f1ec] px-4 py-2.5 text-[11px] text-[#8a8378]">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-[3px] border border-[#e2dcd2]" style={{ background: TRAMA }} />
          fuera de turno, vacaciones o rato bloqueado
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-[3px] border border-dashed border-[#c2410c]" />
          hueco aprovechable mientras la clienta espera
        </span>
      </div>
    </div>
  );
}
