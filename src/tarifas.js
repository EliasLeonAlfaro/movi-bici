// Cálculo de la tarifa de un viaje (ver ESPECIFICACION_FUNCIONAL.md, RN-03).
const TARIFA_MIN = { clasica: 60, electrica: 120, carga: 150 };
const DESCUENTO_TIPO = { regular: 0, estudiante: 20, premium: 30 };
const DESBLOQUEO = 300;

function minutosCobrables(inicio, fin) {
  const segundos = (new Date(fin) - new Date(inicio)) / 1000;
  return Math.max(1, Math.ceil(segundos / 60));
}

function calcularCosto({ minutos, tipoBici, tipoUsuario, cupon }) {
  const tarifa = TARIFA_MIN[tipoBici];
  const normales = Math.min(minutos, 59);
  const extra = Math.max(0, minutos - 59);
  const bruto = DESBLOQUEO + tarifa * normales + 2 * tarifa * extra;

  let pct = DESCUENTO_TIPO[tipoUsuario] || 0;
  if (cupon) {
    if (cupon.codigo === 'PRIMERVIAJE') {
      if (minutos <= 30) return 0;
    } else {
      pct += cupon.descuento_pct;
    }
  }
  return Math.round(bruto * (1 - pct / 100));
}

module.exports = { TARIFA_MIN, DESCUENTO_TIPO, DESBLOQUEO, minutosCobrables, calcularCosto };
