// Aritmética de la rejilla de agenda, aparte del componente para poder
// EJECUTARLA en pruebas. Un error de minutos aquí no da ningún error: pinta
// una cita en la hora equivocada y nadie se entera hasta que una clienta se
// presenta cuando no toca.

export type Turno = { weekday: number; open_time: string; close_time: string };
export type Ausencia = { start_date: string; end_date: string; reason?: string | null };
export type Franja = { desde: number; hasta: number; motivo: string };

/** "09:30" → 570 minutos desde medianoche. null si no es una hora válida. */
export function aMinutos(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm));
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const dd = (n: number) => String(n).padStart(2, '0');
export const aHhmm = (min: number) => `${dd(Math.floor(min / 60))}:${dd(min % 60)}`;

/**
 * Ventana visible de la rejilla: el horario del día, ampliado si alguna cita
 * o bloqueo se sale de él. Una cita antigua NO puede quedar invisible porque
 * la tienda haya cambiado su horario después.
 */
export function ventanaDelDia({
  abre,
  cierra,
  minutosCitas = [],
  minutosBloqueos = []
}: {
  abre: string | null;
  cierra: string | null;
  minutosCitas?: { desde: number; hasta: number }[];
  minutosBloqueos?: { desde: number; hasta: number }[];
}): { inicio: number; fin: number } {
  let inicio = aMinutos(abre) ?? 9 * 60;
  let fin = aMinutos(cierra) ?? 20 * 60;

  for (const r of [...minutosCitas, ...minutosBloqueos]) {
    inicio = Math.min(inicio, r.desde);
    fin = Math.max(fin, r.hasta);
  }
  inicio = Math.floor(inicio / 60) * 60;
  fin = Math.ceil(fin / 60) * 60;
  if (fin - inicio < 120) fin = inicio + 120;
  return { inicio, fin };
}

/**
 * Franjas en las que una persona NO puede atender: vacaciones o fuera de
 * turno.
 *
 * REGLA CRÍTICA: «sin turnos = todo el horario» se aplica A LA PERSONA, no al
 * día. Quien no tiene NINGÚN turno declarado atiende siempre; quien tiene
 * horario propio y ese día no aparece, LIBRA — el día entero va rayado. Es
 * exactamente lo que calcula el motor en el backend
 * (equipo.disponibilidadEnRango). Si la pantalla pintara otra cosa estaría
 * mintiendo, y una peluquera que no se fía de su agenda vuelve al papel.
 */
export function franjasFueraDeTurno({
  turnos = [],
  ausencias = [],
  fecha,
  diaSemana,
  inicio,
  fin
}: {
  turnos?: Turno[];
  ausencias?: Ausencia[];
  fecha: string;
  diaSemana: number;
  inicio: number;
  fin: number;
}): Franja[] {
  const libra = ausencias.some((a) => a.start_date <= fecha && a.end_date >= fecha);
  if (libra) return [{ desde: inicio, hasta: fin, motivo: 'libra' }];

  if (!turnos.length) return [];                 // sin horario propio: atiende siempre
  const suyos = turnos.filter((t) => t.weekday === diaSemana);
  if (!suyos.length) return [{ desde: inicio, hasta: fin, motivo: 'libra' }];

  const bandas = suyos
    .map((t) => ({ d: aMinutos(t.open_time) ?? inicio, h: aMinutos(t.close_time) ?? fin }))
    .sort((a, b) => a.d - b.d);

  const fuera: Franja[] = [];
  let cursor = inicio;
  for (const b of bandas) {
    if (b.d > cursor) fuera.push({ desde: cursor, hasta: Math.min(b.d, fin), motivo: 'fuera de turno' });
    cursor = Math.max(cursor, b.h);
  }
  if (cursor < fin) fuera.push({ desde: cursor, hasta: fin, motivo: 'fuera de turno' });
  return fuera;
}
