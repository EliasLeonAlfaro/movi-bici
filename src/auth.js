const { verificar } = require('./util');

function identificar(req, res, next) {
  const cab = req.headers.authorization || '';
  if (cab.startsWith('Bearer ')) {
    const payload = verificar(cab.slice(7));
    if (payload) req.usuario = payload;
  }
  next();
}

function requiereLogin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Debes iniciar sesión' });
  next();
}

function soloAdmin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: 'Debes iniciar sesión' });
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Acceso restringido a administradores' });
  next();
}

module.exports = { identificar, requiereLogin, soloAdmin };
