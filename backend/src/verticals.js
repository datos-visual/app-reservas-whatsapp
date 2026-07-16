// Paquetes semilla por vertical (doc 08 §4). El motor es único y genérico:
// el vertical solo aporta configuración inicial EDITABLE por la tienda.
// El onboarding copia la semilla a `services` al elegir vertical.

const VERTICAL_SEEDS = {
  peluqueria: {
    label: 'Peluquería / estética',
    services: [
      { name: 'Corte', duration_minutes: 30, price_eur: 15, description: 'Corte de pelo — 30 min', sort_order: 1 },
      { name: 'Corte + lavado', duration_minutes: 45, price_eur: 19, description: 'Con lavado y secado — 45 min', sort_order: 2 },
      { name: 'Tinte', duration_minutes: 120, price_eur: 45, description: 'Coloración completa — 2 h', sort_order: 3 },
      { name: 'Mechas', duration_minutes: 150, price_eur: 60, description: 'Mechas o balayage — 2 h 30', sort_order: 4 },
      { name: 'Peinado evento', duration_minutes: 45, price_eur: 25, description: 'Recogidos y eventos — 45 min', sort_order: 5 },
      { name: 'Barba', duration_minutes: 15, price_eur: 8, description: 'Arreglo de barba — 15 min', sort_order: 6 },
      { name: 'Tratamiento keratina', duration_minutes: 90, price_eur: 50, description: 'Alisado y keratina — 1 h 30', sort_order: 7 }
    ]
  },
  taller: {
    label: 'Taller mecánico',
    services: [
      { name: 'Pre-ITV + gestión ITV', duration_minutes: 240, price_eur: null, description: 'Te la gestionamos — mañana o tarde', mode: 'franja', sort_order: 1 },
      { name: 'Revisión / mantenimiento', duration_minutes: 480, price_eur: null, description: 'Revisión completa — día entero', mode: 'franja', sort_order: 2 },
      { name: 'Cambio de aceite y filtros', duration_minutes: 60, price_eur: null, description: '1 hora aprox.', sort_order: 3 },
      { name: 'Neumáticos', duration_minutes: 45, price_eur: null, description: 'Cambio o reparación — 45 min', sort_order: 4 },
      { name: 'Frenos', duration_minutes: 120, price_eur: null, description: 'Pastillas/discos — 2 h', sort_order: 5 },
      { name: 'Diagnóstico de avería', duration_minutes: 60, price_eur: null, description: 'Cuéntanos qué le pasa — 1 h', sort_order: 6 },
      { name: 'Aire acondicionado', duration_minutes: 60, price_eur: null, description: 'Carga y revisión — 1 h', sort_order: 7 }
    ]
  }
};

function getVerticalSeed(verticalCode) {
  return VERTICAL_SEEDS[verticalCode] || null;
}

module.exports = { VERTICAL_SEEDS, getVerticalSeed };
