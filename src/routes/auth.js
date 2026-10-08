const express = require('express');
const { db, consultar, uno, ejecutar } = require('../db');
const { md5, firmar, rutFormatoValido, ahora } = require('../util');
const { requiereLogin } = require('../auth');

const r = express.Router();

const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, tipo: u.tipo, saldo: u.saldo });

r.post('/registro', (req, res) => {
  const { nombre, email, rut, password } = req.body || {};
  if (!nombre || !email || !rut || !password) return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Correo electrónico inválido' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número' });
  if (!rutFormatoValido(rut)) return res.status(400).json({ error: 'RUT inválido' });
  if (uno('SELECT id FROM usuarios WHERE email = ?', email)) return res.status(409).json({ error: 'El correo ya está registrado' });

  const info = ejecutar(
    'INSERT INTO usuarios (nombre,email,rut,password_hash,rol,tipo,saldo,estado,creado) VALUES (?,?,?,?,?,?,?,?,?)',
    nombre, email, rut, md5(password), 'usuario', 'regular', 0, 'activo', ahora().toISOString());
  const u = uno('SELECT * FROM usuarios WHERE id = ?', info.lastInsertRowid);
  res.status(201).json({ token: firmar({ id: u.id, email: u.email, rol: u.rol }), usuario: publico(u) });
});

r.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const hash = md5(password || '');
  const u = db.prepare(`SELECT * FROM usuarios WHERE email = '${email}' AND password_hash = '${hash}'`).get();
  if (!u) {
    const existe = uno('SELECT id FROM usuarios WHERE email = ?', email);
    return res.status(401).json({ error: existe ? 'Contraseña incorrecta' : 'Usuario no registrado' });
  }
  if (u.estado === 'bloqueado') return res.status(403).json({ error: 'Cuenta bloqueada. Contacta a soporte.' });
  res.json({ token: firmar({ id: u.id, email: u.email, rol: u.rol }), usuario: publico(u) });
});

r.get('/yo', requiereLogin, (req, res) => {
  const u = uno('SELECT * FROM usuarios WHERE id = ?', req.usuario.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(publico(u));
});

r.post('/recuperar', (req, res) => {
  const { email } = req.body || {};
  const u = uno('SELECT id FROM usuarios WHERE email = ?', email);
  if (u) {
    const token = md5(email + ahora().getTime()).slice(0, 6);
    ejecutar('INSERT INTO reset_tokens (email,token,creado) VALUES (?,?,?)', email, token, ahora().toISOString());
    return res.json({ mensaje: 'Te enviamos un correo con las instrucciones', token_dev: token });
  }
  res.json({ mensaje: 'Te enviamos un correo con las instrucciones' });
});

r.post('/restablecer', (req, res) => {
  const { token, nueva } = req.body || {};
  const t = uno('SELECT * FROM reset_tokens WHERE token = ?', token);
  if (!t) return res.status(400).json({ error: 'Token inválido' });
  ejecutar('UPDATE usuarios SET password_hash = ? WHERE email = ?', md5(nueva), t.email);
  ejecutar('DELETE FROM reset_tokens WHERE token = ?', token);
  res.json({ mensaje: 'Contraseña actualizada' });
});

module.exports = r;
