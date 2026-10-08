const express = require('express');
const path = require('node:path');
const { iniciar } = require('./db');
const { identificar } = require('./auth');
const openapi = require('./openapi');

iniciar();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const PUBLICO = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(identificar);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/viajes', require('./routes/viajes'));
app.use('/api', require('./routes/catalogo'));
app.use('/api', require('./routes/cuenta'));
app.use('/api', require('./routes/sistema'));
app.get('/api/openapi.json', (req, res) => res.json(openapi));

app.get('/docs', (req, res) => res.sendFile(path.join(PUBLICO, 'docs.html')));
app.get('/ir', (req, res) => res.redirect(req.query.url));
app.use(express.static(PUBLICO));

app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, detalle: err.stack, ruta: req.originalUrl });
});

app.listen(PORT, () => console.log(`MoviBici v0.9.0-rc1 escuchando en http://localhost:${PORT}`));
