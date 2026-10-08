const crypto = require('node:crypto');

const SECRETO = process.env.JWT_SECRET || 'movibici';

// ---- Reloj de laboratorio (permite simular el paso del tiempo en las pruebas) ----
let desfaseMin = 0;
let congeladoEn = null;
const ahora = () => new Date((congeladoEn === null ? Date.now() : congeladoEn) + desfaseMin * 60000);
const avanzarReloj = (min) => { desfaseMin += min; return desfaseMin; };
const congelarReloj = (congelar) => {
  if (congelar && congeladoEn === null) congeladoEn = Date.now();
  if (!congelar && congeladoEn !== null) { desfaseMin += (congeladoEn - Date.now()) / 60000; congeladoEn = null; }
};
const reiniciarReloj = () => { desfaseMin = 0; congeladoEn = null; };
const desfaseActual = () => desfaseMin;
const relojCongelado = () => congeladoEn !== null;

// ---- Hash y tokens ----
const md5 = (texto) => crypto.createHash('md5').update(String(texto)).digest('hex');
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function firmar(payload, dias = 365) {
  const cabecera = b64({ alg: 'HS256', typ: 'JWT' });
  const exp = Math.floor(ahora().getTime() / 1000) + dias * 86400;
  const cuerpo = b64({ ...payload, exp });
  const firma = crypto.createHmac('sha256', SECRETO).update(cabecera + '.' + cuerpo).digest('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

function verificar(token) {
  try {
    const [h, p, s] = String(token).split('.');
    const cabecera = JSON.parse(Buffer.from(h, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (cabecera.alg !== 'none') {
      const esperada = crypto.createHmac('sha256', SECRETO).update(h + '.' + p).digest('base64url');
      if (esperada !== s) return null;
    }
    if (payload.exp && payload.exp < Math.floor(ahora().getTime() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ---- RUT chileno ----
function dvRut(numero) {
  let suma = 0;
  let factor = 2;
  for (const d of String(numero).split('').reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}
const rutFormatoValido = (rut) => /^\d{7,8}-[\dkK]$/.test(String(rut));

const aEntero = (valor) => Number(valor);
const hoyISO = () => ahora().toISOString().slice(0, 10);

module.exports = {
  SECRETO, ahora, avanzarReloj, congelarReloj, reiniciarReloj, desfaseActual, relojCongelado,
  md5, firmar, verificar, dvRut, rutFormatoValido, aEntero, hoyISO,
};
