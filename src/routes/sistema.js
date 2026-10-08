const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { sembrar } = require('../db');
const { avanzarReloj, congelarReloj, desfaseActual, relojCongelado, ahora } = require('../util');

const r = express.Router();
const DIR_COMPROBANTES = path.join(__dirname, '..', '..', 'comprobantes');
const LAB = process.env.LAB_MODE === '1';

r.get('/salud', (req, res) => {
  res.json({
    estado: 'ok',
    version: '0.9.0-rc1',
    node: process.version,
    entorno: process.env.NODE_ENV || 'desarrollo',
    base_de_datos: process.env.DB_PATH || '/app/data/movibici.db',
    uptime_s: Math.round(process.uptime()),
  });
});

r.get('/comprobantes/descargar', (req, res) => {
  const archivo = req.query.archivo || '';
  const ruta = path.join(DIR_COMPROBANTES, archivo);
  fs.readFile(ruta, 'utf8', (err, texto) => {
    if (err) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.type('text/plain').send(texto);
  });
});

// ---- Instrumentos de laboratorio (fuera del alcance de las pruebas de seguridad) ----
r.get('/lab/reloj', (req, res) => {
  if (!LAB) return res.status(404).json({ error: 'No disponible' });
  res.json({ desfase_min: desfaseActual(), congelado: relojCongelado(), hora_sistema: ahora().toISOString() });
});

r.post('/lab/reloj', (req, res) => {
  if (!LAB) return res.status(404).json({ error: 'No disponible' });
  const { minutos, congelar } = req.body || {};
  if (typeof congelar === 'boolean') congelarReloj(congelar);
  if (minutos !== undefined) {
    if (!Number.isFinite(Number(minutos))) return res.status(400).json({ error: '"minutos" debe ser un número' });
    avanzarReloj(Number(minutos));
  }
  res.json({ desfase_min: desfaseActual(), congelado: relojCongelado(), hora_sistema: ahora().toISOString() });
});

r.post('/lab/reset', (req, res) => {
  if (!LAB) return res.status(404).json({ error: 'No disponible' });
  sembrar();
  for (const f of fs.existsSync(DIR_COMPROBANTES) ? fs.readdirSync(DIR_COMPROBANTES) : []) {
    if (f.startsWith('comprobante_')) fs.unlinkSync(path.join(DIR_COMPROBANTES, f));
  }
  res.json({ mensaje: 'Datos de laboratorio restablecidos' });
});

module.exports = r;
