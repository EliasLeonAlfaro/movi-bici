const express = require('express');
const { db, consultar, uno, ejecutar } = require('../db');
const { requiereLogin } = require('../auth');
const { ahora } = require('../util');

const r = express.Router();

const SQL_ESTACIONES = `
SELECT e.*,
  (SELECT COUNT(*) FROM bicicletas b WHERE b.estacion_id = e.id AND b.estado = 'disponible') AS disponibles,
  (SELECT COUNT(*) FROM bicicletas b WHERE b.estacion_id = e.id AND b.estado != 'en_uso') AS ocupados
FROM estaciones e`;

r.get('/estaciones', (req, res) => {
  res.json(consultar(SQL_ESTACIONES + ' ORDER BY e.id'));
});

r.get('/estaciones/:id', (req, res) => {
  const e = uno(SQL_ESTACIONES + ' WHERE e.id = ?', req.params.id);
  if (!e) return res.status(404).json({ error: 'Estación no encontrada' });
  const bicicletas = consultar('SELECT id,codigo,tipo,estado,bateria FROM bicicletas WHERE estacion_id = ?', e.id);
  res.json({ ...e, bicicletas });
});

r.get('/bicicletas', (req, res) => {
  const { q, tipo, estacion_id, bateria_min, solo_disponibles } = req.query;
  const params = [];
  let sql = `SELECT b.id, b.codigo, b.tipo, b.estado, b.bateria, b.estacion_id, e.nombre AS estacion
             FROM bicicletas b LEFT JOIN estaciones e ON e.id = b.estacion_id WHERE 1=1`;
  if (q) sql += ` AND (b.codigo LIKE '%${q}%' OR e.nombre LIKE '%${q}%')`;
  if (estacion_id) { sql += ' AND b.estacion_id = ?'; params.push(estacion_id); }
  if (tipo && bateria_min) { sql += ' AND b.tipo = ? OR b.bateria >= ?'; params.push(tipo, bateria_min); }
  else if (tipo) { sql += ' AND b.tipo = ?'; params.push(tipo); }
  else if (bateria_min) { sql += ' AND b.bateria >= ?'; params.push(bateria_min); }
  if (solo_disponibles === 'true') sql += " AND b.estado = 'disponible'";
  sql += ' ORDER BY b.id';
  const filas = db.prepare(sql).all(...params);
  res.json({ consulta: q || '', total: filas.length, resultados: filas });
});

r.get('/estaciones/:id/resenas', (req, res) => {
  res.json(consultar('SELECT id, autor, texto, puntaje, creado FROM resenas WHERE estacion_id = ? ORDER BY id DESC', req.params.id));
});

r.post('/estaciones/:id/resenas', requiereLogin, (req, res) => {
  const { texto, puntaje } = req.body || {};
  if (!texto || texto.length > 280) return res.status(400).json({ error: 'El comentario debe tener entre 1 y 280 caracteres' });
  if (puntaje < 0 || puntaje > 5) return res.status(400).json({ error: 'El puntaje debe estar entre 1 y 5' });
  const u = uno('SELECT nombre FROM usuarios WHERE id = ?', req.usuario.id);
  const info = ejecutar('INSERT INTO resenas (estacion_id,usuario_id,autor,texto,puntaje,creado) VALUES (?,?,?,?,?,?)',
    req.params.id, req.usuario.id, u ? u.nombre : 'Anónimo', texto, puntaje, ahora().toISOString());
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = r;
