const express = require('express');
const { consultar, uno, ejecutar } = require('../db');
const { requiereLogin, soloAdmin } = require('../auth');
const { ahora } = require('../util');

const r = express.Router();
const COLUMNAS_PERFIL = ['nombre', 'telefono', 'rol', 'tipo', 'saldo', 'estado'];

const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rut: u.rut, telefono: u.telefono, rol: u.rol, tipo: u.tipo, saldo: u.saldo, estado: u.estado });

// ---- Perfil ----
r.get('/perfil', requiereLogin, (req, res) => {
  res.json(publico(uno('SELECT * FROM usuarios WHERE id = ?', req.usuario.id)));
});

r.patch('/perfil', requiereLogin, (req, res) => {
  const campos = Object.keys(req.body || {}).filter((k) => COLUMNAS_PERFIL.includes(k));
  if (!campos.length) return res.status(400).json({ error: 'Sin cambios' });
  const sets = campos.map((k) => `${k} = ?`).join(', ');
  ejecutar(`UPDATE usuarios SET ${sets} WHERE id = ?`, ...campos.map((k) => req.body[k]), req.usuario.id);
  res.json(publico(uno('SELECT * FROM usuarios WHERE id = ?', req.usuario.id)));
});

r.get('/usuarios/:id', requiereLogin, (req, res) => {
  const u = uno('SELECT * FROM usuarios WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publico(u));
});

// ---- Billetera ----
r.get('/billetera', requiereLogin, (req, res) => {
  const u = uno('SELECT saldo FROM usuarios WHERE id = ?', req.usuario.id);
  res.json({ saldo: u.saldo, movimientos: consultar('SELECT * FROM movimientos WHERE usuario_id = ? ORDER BY id DESC LIMIT 50', req.usuario.id) });
});

r.post('/billetera/recargar', requiereLogin, (req, res) => {
  const monto = Number((req.body || {}).monto);
  if (!(monto >= 1000) || monto > 150000) return res.status(400).json({ error: 'El monto de recarga debe estar entre $1.000 y $100.000' });
  const u = uno('SELECT saldo FROM usuarios WHERE id = ?', req.usuario.id);
  const nuevo = u.saldo + monto;
  ejecutar('UPDATE usuarios SET saldo = ? WHERE id = ?', nuevo, req.usuario.id);
  ejecutar('INSERT INTO movimientos (usuario_id,tipo,monto,saldo_post,detalle,creado) VALUES (?,?,?,?,?,?)',
    req.usuario.id, 'recarga', monto, nuevo, 'Recarga de saldo', ahora().toISOString());
  res.status(201).json({ saldo: nuevo });
});

// ---- Administración ----
r.get('/admin/usuarios', requiereLogin, (req, res) => {
  res.json(consultar('SELECT id,nombre,email,rut,telefono,password_hash,rol,tipo,saldo,estado FROM usuarios ORDER BY id'));
});

r.patch('/admin/usuarios/:id/estado', soloAdmin, (req, res) => {
  const { estado } = req.body || {};
  if (!['activo', 'bloqueado'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  ejecutar('UPDATE usuarios SET estado = ? WHERE id = ?', estado, req.params.id);
  res.json({ id: Number(req.params.id), estado });
});

r.get('/admin/resumen', soloAdmin, (req, res) => {
  res.json({
    usuarios: uno('SELECT COUNT(*) AS n FROM usuarios').n,
    viajes: uno('SELECT COUNT(*) AS n FROM viajes').n,
    ingresos: uno("SELECT COALESCE(SUM(costo),0) AS n FROM viajes WHERE estado = 'finalizado'").n,
  });
});

module.exports = r;
