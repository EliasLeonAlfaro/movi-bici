const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { consultar, uno, ejecutar } = require('../db');
const { requiereLogin } = require('../auth');
const { ahora, hoyISO } = require('../util');
const { calcularCosto, minutosCobrables } = require('../tarifas');

const r = express.Router();
const DIR_COMPROBANTES = path.join(__dirname, '..', '..', 'comprobantes');

function validarCupon(codigo, usuario) {
  const c = uno('SELECT * FROM cupones WHERE codigo = ?', codigo);
  if (!c) return { error: 'Cupón no existe', status: 404 };
  if (c.vence <= hoyISO()) return { error: 'Cupón vencido', status: 409 };
  if (c.usos >= c.usos_max) return { error: 'Cupón agotado', status: 409 };
  if (c.solo_tipo && c.solo_tipo !== usuario.tipo) return { error: 'Cupón no aplicable a tu tipo de cuenta', status: 409 };
  if (c.codigo !== 'PRIMERVIAJE' && uno('SELECT 1 FROM cupon_usos WHERE usuario_id = ? AND codigo = ?', usuario.id, codigo))
    return { error: 'Ya utilizaste este cupón', status: 409 };
  return { cupon: c };
}

r.post('/reservar', requiereLogin, (req, res) => {
  const u = uno('SELECT * FROM usuarios WHERE id = ?', req.usuario.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.estado !== 'activo') return res.status(403).json({ error: 'Cuenta bloqueada' });
  if (uno("SELECT id FROM viajes WHERE usuario_id = ? AND estado IN ('reservado','en_curso')", u.id))
    return res.status(409).json({ error: 'Ya tienes un viaje activo' });
  if (u.saldo <= 2000) return res.status(402).json({ error: 'Saldo insuficiente: se requieren al menos $2.000' });

  const b = uno('SELECT * FROM bicicletas WHERE id = ?', (req.body || {}).bicicleta_id);
  if (!b) return res.status(404).json({ error: 'Bicicleta no encontrada' });
  if (b.estado !== 'disponible') return res.status(409).json({ error: 'La bicicleta no está disponible' });
  if (b.tipo === 'electrica' && b.bateria <= 20) return res.status(409).json({ error: 'Batería insuficiente (mínimo 20%)' });

  const codigo = String(Math.floor(1000 + Math.random() * 9000));
  const info = ejecutar(
    "INSERT INTO viajes (usuario_id,bicicleta_id,estacion_origen,estado,codigo_desbloqueo,creado) VALUES (?,?,?,'reservado',?,?)",
    u.id, b.id, b.estacion_id, codigo, ahora().toISOString());
  ejecutar("UPDATE bicicletas SET estado = 'reservada' WHERE id = ?", b.id);
  res.status(201).json(uno('SELECT * FROM viajes WHERE id = ?', info.lastInsertRowid));
});

function propio(req, res) {
  const v = uno('SELECT * FROM viajes WHERE id = ?', req.params.id);
  if (!v) { res.status(404).json({ error: 'Viaje no encontrado' }); return null; }
  if (v.usuario_id !== req.usuario.id) { res.status(403).json({ error: 'No puedes operar sobre este viaje' }); return null; }
  return v;
}

r.post('/:id/iniciar', requiereLogin, (req, res) => {
  const v = propio(req, res); if (!v) return;
  if (v.estado !== 'reservado') return res.status(409).json({ error: `No se puede iniciar un viaje en estado ${v.estado}` });
  const transcurridos = (ahora() - new Date(v.creado)) / 60000;
  if (transcurridos > 15) {
    ejecutar("UPDATE viajes SET estado = 'cancelado' WHERE id = ?", v.id);
    ejecutar("UPDATE bicicletas SET estado = 'disponible' WHERE id = ?", v.bicicleta_id);
    return res.status(410).json({ error: 'La reserva expiró' });
  }
  if (String((req.body || {}).codigo) !== v.codigo_desbloqueo) return res.status(400).json({ error: 'Código de desbloqueo incorrecto' });
  ejecutar("UPDATE viajes SET estado = 'en_curso', inicio = ? WHERE id = ?", ahora().toISOString(), v.id);
  ejecutar("UPDATE bicicletas SET estado = 'en_uso', estacion_id = NULL WHERE id = ?", v.bicicleta_id);
  res.json(uno('SELECT * FROM viajes WHERE id = ?', v.id));
});

r.post('/:id/finalizar', requiereLogin, (req, res) => {
  const v = propio(req, res); if (!v) return;
  if (v.estado === 'cancelado') return res.status(409).json({ error: 'El viaje fue cancelado' });
  const { estacion_id, cupon: codigoCupon } = req.body || {};
  const destino = uno('SELECT * FROM estaciones WHERE id = ?', estacion_id);
  if (!destino) return res.status(400).json({ error: 'Estación de destino inválida' });

  const u = uno('SELECT * FROM usuarios WHERE id = ?', v.usuario_id);
  const b = uno('SELECT * FROM bicicletas WHERE id = ?', v.bicicleta_id);
  let cupon = null;
  if (codigoCupon) {
    const val = validarCupon(codigoCupon, u);
    if (val.error) return res.status(val.status).json({ error: val.error });
    cupon = val.cupon;
  }

  const fin = ahora();
  const minutos = minutosCobrables(v.inicio || v.creado, fin);
  const costo = calcularCosto({ minutos, tipoBici: b.tipo, tipoUsuario: u.tipo, cupon });
  const saldoPost = u.saldo - costo;

  ejecutar("UPDATE viajes SET estado = 'finalizado', fin = ?, minutos = ?, costo = ?, cupon = ?, estacion_destino = ? WHERE id = ?",
    fin.toISOString(), minutos, costo, cupon ? cupon.codigo : null, destino.id, v.id);
  ejecutar('UPDATE usuarios SET saldo = ? WHERE id = ?', saldoPost, u.id);
  ejecutar('INSERT INTO movimientos (usuario_id,tipo,monto,saldo_post,detalle,creado) VALUES (?,?,?,?,?,?)',
    u.id, 'viaje', -costo, saldoPost, `Viaje #${v.id} (${minutos} min)`, fin.toISOString());
  const bateria = b.bateria === null ? null : Math.max(0, b.bateria - minutos);
  ejecutar("UPDATE bicicletas SET estado = 'disponible', estacion_id = ?, bateria = ? WHERE id = ?", destino.id, bateria, b.id);
  if (cupon) {
    ejecutar('UPDATE cupones SET usos = usos + 1 WHERE codigo = ?', cupon.codigo);
    ejecutar('INSERT INTO cupon_usos (usuario_id,codigo,viaje_id) VALUES (?,?,?)', u.id, cupon.codigo, v.id);
  }

  fs.mkdirSync(DIR_COMPROBANTES, { recursive: true });
  const nombre = `comprobante_${v.id}.txt`;
  fs.writeFileSync(path.join(DIR_COMPROBANTES, nombre),
    `MoviBici - Comprobante de viaje #${v.id}\nUsuario: ${u.nombre} (${u.rut})\nBicicleta: ${b.codigo}\nDuración: ${minutos} min\nCosto: $${costo}\nFecha: ${fin.toISOString()}\n`);

  res.json({ ...uno('SELECT * FROM viajes WHERE id = ?', v.id), comprobante: nombre, saldo: saldoPost });
});

r.post('/:id/cancelar', requiereLogin, (req, res) => {
  const v = propio(req, res); if (!v) return;
  if (v.estado !== 'reservado' && v.estado !== 'en_curso')
    return res.status(409).json({ error: `No se puede cancelar un viaje en estado ${v.estado}` });
  ejecutar("UPDATE viajes SET estado = 'cancelado' WHERE id = ?", v.id);
  ejecutar("UPDATE bicicletas SET estado = 'disponible', estacion_id = ? WHERE id = ?", v.estacion_origen, v.bicicleta_id);
  res.json(uno('SELECT * FROM viajes WHERE id = ?', v.id));
});

r.get('/', requiereLogin, (req, res) => {
  res.json(consultar('SELECT * FROM viajes WHERE usuario_id = ? ORDER BY id DESC', req.usuario.id));
});

r.get('/:id', requiereLogin, (req, res) => {
  const v = uno('SELECT * FROM viajes WHERE id = ?', req.params.id);
  if (!v) return res.status(404).json({ error: 'Viaje no encontrado' });
  res.json(v);
});

module.exports = r;
