const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { md5, dvRut, ahora, reiniciarReloj, hoyISO } = require('./util');
const { calcularCosto, minutosCobrables } = require('./tarifas');

const RUTA_DB = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'movibici.db');
fs.mkdirSync(path.dirname(RUTA_DB), { recursive: true });
const db = new DatabaseSync(RUTA_DB);

const consultar = (sql, ...p) => db.prepare(sql).all(...p);
const uno = (sql, ...p) => db.prepare(sql).get(...p);
const ejecutar = (sql, ...p) => db.prepare(sql).run(...p);

const ESQUEMA = `
DROP TABLE IF EXISTS usuarios;   DROP TABLE IF EXISTS estaciones;  DROP TABLE IF EXISTS bicicletas;
DROP TABLE IF EXISTS viajes;     DROP TABLE IF EXISTS cupones;     DROP TABLE IF EXISTS cupon_usos;
DROP TABLE IF EXISTS resenas;    DROP TABLE IF EXISTS movimientos; DROP TABLE IF EXISTS reset_tokens;

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT NOT NULL UNIQUE, rut TEXT NOT NULL,
  telefono TEXT, password_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'usuario',
  tipo TEXT NOT NULL DEFAULT 'regular', saldo INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'activo', creado TEXT NOT NULL);
CREATE TABLE estaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, comuna TEXT NOT NULL, direccion TEXT,
  lat REAL, lng REAL, capacidad INTEGER NOT NULL);
CREATE TABLE bicicletas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, tipo TEXT NOT NULL,
  estacion_id INTEGER, estado TEXT NOT NULL, bateria INTEGER);
CREATE TABLE viajes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, bicicleta_id INTEGER NOT NULL,
  estacion_origen INTEGER, estacion_destino INTEGER, estado TEXT NOT NULL, codigo_desbloqueo TEXT,
  creado TEXT NOT NULL, inicio TEXT, fin TEXT, minutos INTEGER, costo INTEGER, cupon TEXT);
CREATE TABLE cupones (
  codigo TEXT PRIMARY KEY, descuento_pct INTEGER NOT NULL, vence TEXT NOT NULL,
  usos_max INTEGER NOT NULL, usos INTEGER NOT NULL DEFAULT 0, solo_tipo TEXT);
CREATE TABLE cupon_usos (usuario_id INTEGER, codigo TEXT, viaje_id INTEGER);
CREATE TABLE resenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, estacion_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL,
  autor TEXT NOT NULL, texto TEXT NOT NULL, puntaje INTEGER NOT NULL, creado TEXT NOT NULL);
CREATE TABLE movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, tipo TEXT NOT NULL,
  monto INTEGER NOT NULL, saldo_post INTEGER NOT NULL, detalle TEXT, creado TEXT NOT NULL);
CREATE TABLE reset_tokens (email TEXT, token TEXT, creado TEXT);
`;

const ESTACIONES = [
  ['Plaza Italia', 'Santiago', 'Av. Libertador B. O\'Higgins 10', -33.4372, -70.6344, 12],
  ['Los Leones', 'Providencia', 'Av. Providencia 2222', -33.4224, -70.6055, 12],
  ['Plaza Ñuñoa', 'Ñuñoa', 'Av. Irarrázaval 3450', -33.4569, -70.5976, 12],
  ['Escuela Militar', 'Las Condes', 'Av. Apoquindo 4500', -33.4130, -70.5830, 12],
  ['Campus USACH', 'Estación Central', 'Av. L. B. O\'Higgins 3363', -33.4504, -70.6869, 12],
  ['Barrio Lastarria', 'Santiago', 'J. V. Lastarria 305', -33.4390, -70.6419, 12],
  ['Parque Bustamante', 'Providencia', 'Av. Francisco Bilbao 800', -33.4458, -70.6285, 12],
  ['San Joaquín UC', 'San Joaquín', 'Av. Vicuña Mackenna 4860', -33.4981, -70.6118, 12],
  ['Plaza de Maipú', 'Maipú', 'Av. Pajaritos 1500', -33.5110, -70.7570, 4],
  ['Parque Bicentenario', 'Vitacura', 'Bicentenario 3800', -33.4000, -70.6000, 12],
];

function generador(semilla) {
  let s = semilla;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function sembrar() {
  db.exec(ESQUEMA);
  reiniciarReloj();
  const t = ahora().toISOString();

  const usuario = (nombre, email, num, pass, rol, tipo, saldo) =>
    ejecutar('INSERT INTO usuarios (nombre,email,rut,telefono,password_hash,rol,tipo,saldo,estado,creado) VALUES (?,?,?,?,?,?,?,?,?,?)',
      nombre, email, `${num}-${dvRut(num)}`, '+5699' + String(num).slice(0, 7), md5(pass), rol, tipo, saldo, 'activo', t);
  usuario('Administrador MoviBici', 'admin@movibici.cl', 10111222, 'admin123', 'admin', 'premium', 0);
  usuario('Soporte MoviBici', 'soporte@movibici.cl', 10222333, 'soporte2026', 'soporte', 'regular', 0);
  usuario('Carlos Muñoz', 'carlos.regular@movibici.cl', 15333444, 'Regular2026', 'usuario', 'regular', 20000);
  usuario('Ana Rojas', 'ana.estudiante@movibici.cl', 19444555, 'Estudiante2026', 'usuario', 'estudiante', 15000);
  usuario('Patricia Vidal', 'patricia.premium@movibici.cl', 12555666, 'Premium2026', 'usuario', 'premium', 30000);
  usuario('Borde Mil Novecientos', 'borde1999@movibici.cl', 16666777, 'Borde2026', 'usuario', 'regular', 1999);
  usuario('Borde Dos Mil', 'borde2000@movibici.cl', 17777888, 'Borde2026', 'usuario', 'regular', 2000);
  usuario('Nicolás Sin Viajes', 'nuevo.sinviajes@movibici.cl', 20888999, 'Nuevo2026', 'usuario', 'regular', 10000);

  for (const e of ESTACIONES) ejecutar('INSERT INTO estaciones (nombre,comuna,direccion,lat,lng,capacidad) VALUES (?,?,?,?,?,?)', ...e);

  const rnd = generador(2026);
  let n = 1;
  const bici = (codigo, tipo, est, estado, bat) =>
    ejecutar('INSERT INTO bicicletas (codigo,tipo,estacion_id,estado,bateria) VALUES (?,?,?,?,?)', codigo, tipo, est, estado, bat);
  for (let est = 1; est <= 8; est++) {
    for (let k = 0; k < 5; k++) {
      const r = rnd();
      const tipo = r < 0.55 ? 'clasica' : r < 0.9 ? 'electrica' : 'carga';
      const bat = tipo === 'clasica' ? null : 25 + Math.floor(rnd() * 75);
      const estado = rnd() < 0.08 ? 'mantencion' : 'disponible';
      bici('MB-' + String(n++).padStart(3, '0'), tipo, est, estado, bat);
    }
  }
  bici('MB-E19', 'electrica', 1, 'disponible', 19);
  bici('MB-E20', 'electrica', 2, 'disponible', 20);
  bici('MB-E21', 'electrica', 3, 'disponible', 21);
  for (let k = 1; k <= 4; k++) bici('MB-MP' + k, k === 4 ? 'electrica' : 'clasica', 9, 'disponible', k === 4 ? 80 : null);
  bici('MB-X01', 'clasica', 10, 'disponible', null);
  bici('MB-X02', 'clasica', 10, 'disponible', null);

  const hoy = hoyISO();
  const mes = new Date(ahora().getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const cupon = (c, p, v, max, tipo) => ejecutar('INSERT INTO cupones (codigo,descuento_pct,vence,usos_max,usos,solo_tipo) VALUES (?,?,?,?,0,?)', c, p, v, max, tipo);
  cupon('VERANO10', 10, hoy, 500, null);
  cupon('PRIMERVIAJE', 100, '2099-12-31', 100000, null);
  cupon('UNIVERSIDAD15', 15, '2099-12-31', 100, 'estudiante');
  cupon('CADUCADO20', 20, mes, 500, null);
  cupon('STAFF50', 50, '2099-12-31', 10, null);

  // Historial de viajes para los usuarios de prueba (datos para IDOR y para "primer viaje")
  const historial = [[3, 1, 12, 'clasica', 'regular'], [3, 2, 25, 'clasica', 'regular'], [3, 6, 41, 'electrica', 'regular'],
    [4, 3, 18, 'clasica', 'estudiante'], [4, 5, 33, 'electrica', 'estudiante'],
    [5, 2, 27, 'clasica', 'premium'], [5, 4, 52, 'electrica', 'premium']];
  historial.forEach(([u, est, min, tipo, tu], i) => {
    const fin = new Date(ahora().getTime() - (i + 2) * 86400000);
    const ini = new Date(fin.getTime() - min * 60000);
    const costo = calcularCosto({ minutos: min, tipoBici: tipo, tipoUsuario: tu, cupon: null });
    ejecutar('INSERT INTO viajes (usuario_id,bicicleta_id,estacion_origen,estacion_destino,estado,codigo_desbloqueo,creado,inicio,fin,minutos,costo,cupon) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)',
      u, i + 1, est, est === 2 ? 3 : 2, 'finalizado', '0000', ini.toISOString(), ini.toISOString(), fin.toISOString(), minutosCobrables(ini, fin), costo);
  });

  const dirComp = path.join(__dirname, '..', 'comprobantes');
  fs.mkdirSync(dirComp, { recursive: true });
  for (const v of consultar('SELECT v.id, v.minutos, v.costo, v.fin, u.nombre, u.rut FROM viajes v JOIN usuarios u ON u.id = v.usuario_id')) {
    fs.writeFileSync(path.join(dirComp, `comprobante_${v.id}.txt`),
      `MoviBici - Comprobante de viaje #${v.id}\nUsuario: ${v.nombre} (${v.rut})\nDuración: ${v.minutos} min\nCosto: $${v.costo}\nFecha: ${v.fin}\n`);
  }

  const resena = (est, uid, autor, texto, p) => ejecutar('INSERT INTO resenas (estacion_id,usuario_id,autor,texto,puntaje,creado) VALUES (?,?,?,?,?,?)', est, uid, autor, texto, p, t);
  resena(1, 3, 'Carlos Muñoz', 'Siempre hay bicis disponibles en la mañana. Muy buena estación.', 5);
  resena(1, 4, 'Ana Rojas', 'A veces los anclajes quedan pegados, hay que empujar fuerte.', 3);
  resena(2, 5, 'Patricia Vidal', 'Las eléctricas cargadas duran un buen rato. Recomendada.', 4);
}

function iniciar() {
  const existe = uno("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'");
  if (!existe) sembrar();
}

module.exports = { db, consultar, uno, ejecutar, sembrar, iniciar };
