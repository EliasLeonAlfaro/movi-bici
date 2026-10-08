'use strict';
const $ = (s, el = document) => el.querySelector(s);
const vista = $('#vista');
const sesion = {
  token: localStorage.getItem('mb_token'),
  usuario: JSON.parse(localStorage.getItem('mb_usuario') || 'null'),
};
const CLP = (n) => '$' + Number(n).toLocaleString('es-CL');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIPOS = { clasica: 'Clásica', electrica: 'Eléctrica', carga: 'De carga' };

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const r = await fetch('/api' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(sesion.token ? { Authorization: 'Bearer ' + sesion.token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Error inesperado'), { estado: r.status });
  return datos;
}

function aviso(msg, mal) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast on' + (mal ? ' mal' : '');
  clearTimeout(aviso.h);
  aviso.h = setTimeout(() => (t.className = 'toast'), 3600);
}

function guardarSesion(token, usuario) {
  sesion.token = token; sesion.usuario = usuario;
  if (token) { localStorage.setItem('mb_token', token); localStorage.setItem('mb_usuario', JSON.stringify(usuario)); }
  else { localStorage.removeItem('mb_token'); localStorage.removeItem('mb_usuario'); }
  pintarMenu();
}

function pintarMenu() {
  const u = sesion.usuario;
  const enlaces = [['#/', 'Estaciones'], ['#/bicicletas', 'Bicicletas']];
  if (u) enlaces.push(['#/viaje', 'Mi viaje'], ['#/billetera', 'Billetera'], ['#/perfil', u.nombre.split(' ')[0]]);
  if (u && u.rol === 'admin') enlaces.push(['#/admin', 'Admin']);
  enlaces.push(u ? ['#/salir', 'Salir'] : ['#/login', 'Ingresar']);
  if (!u) enlaces.push(['#/registro', 'Crear cuenta', 'cta']);
  $('#menu').innerHTML = enlaces.map(([h, t, c]) => `<a href="${h}" class="${c || ''}">${t}</a>`).join('');
}

// ---------- Vistas ----------
async function vistaInicio() {
  const est = await api('/estaciones');
  const disp = est.reduce((a, e) => a + e.disponibles, 0);
  const lats = est.map((e) => e.lat), lngs = est.map((e) => e.lng);
  const [la0, la1, ln0, ln1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const pts = est.map((e) => {
    const x = 50 + ((e.lng - ln0) / (ln1 - ln0)) * 800, y = 270 - ((e.lat - la0) / (la1 - la0)) * 230;
    const r = 8 + e.disponibles;
    return `<a href="#/estacion/${e.id}"><circle cx="${x}" cy="${y}" r="${r}" fill="${e.disponibles ? '#b6f24a' : '#ff6b6b'}" fill-opacity=".28" stroke="${e.disponibles ? '#b6f24a' : '#ff6b6b'}" stroke-width="2"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#e8f3ee">${e.disponibles}</text>
      <text x="${x}" y="${y + r + 14}" text-anchor="middle" font-size="11" fill="#9db8ae">${esc(e.nombre)}</text></a>`;
  }).join('');
  vista.innerHTML = `
    <section class="hero"><div><h1>Muévete por la ciudad,<br><em>sin esperar el bus.</em></h1>
      <p>Reserva una bicicleta clásica o eléctrica en la estación más cercana, desbloquéala con un código y devuélvela donde termines tu viaje.</p>
      <a class="btn" href="#/bicicletas">Ver bicicletas disponibles</a></div>
      <div class="cifras"><div class="cifra"><b>${est.length}</b><span>estaciones</span></div><div class="cifra"><b>${disp}</b><span>bicicletas libres</span></div><div class="cifra"><b>$60</b><span>por minuto desde</span></div></div></section>
    <div class="mapa" aria-label="Mapa esquemático de estaciones"><svg viewBox="0 0 900 310" role="img">${pts}</svg></div>
    <h2>Estaciones</h2>
    <div class="rejilla">${est.map((e) => `<a class="tarjeta" href="#/estacion/${e.id}" style="color:inherit"><strong>${esc(e.nombre)}</strong><small>${esc(e.comuna)} · ${esc(e.direccion)}</small>
      <div class="barra"><i style="width:${Math.min(100, (e.ocupados / e.capacidad) * 100)}%"></i></div>
      <small>${e.disponibles} disponibles · ${e.ocupados}/${e.capacidad} anclajes ocupados</small></a>`).join('')}</div>`;
}

async function vistaBuscar(params) {
  const q = params.get('q') || '';
  const d = await api('/bicicletas?q=' + encodeURIComponent(q));
  vista.innerHTML = `<h2>Resultados para: <em>${q}</em></h2><p class="etq">${d.total} bicicletas</p>${tablaBicis(d.resultados)}`;
}

function tablaBicis(filas) {
  if (!filas.length) return '<p>No encontramos bicicletas con esos criterios.</p>';
  return `<div class="tabla"><table><thead><tr><th>Código</th><th>Tipo</th><th>Estación</th><th>Batería</th><th>Estado</th><th></th></tr></thead><tbody>${filas.map((b) => `
    <tr><td><strong>${esc(b.codigo)}</strong></td><td>${esc(TIPOS[b.tipo] || b.tipo)}</td><td>${esc(b.estacion || '—')}</td>
    <td>${b.bateria == null ? '—' : esc(b.bateria) + '%'}</td>
    <td><span class="etq ${b.estado === 'disponible' ? 'ok' : b.estado === 'mantencion' ? 'mal' : 'warn'}">${esc(b.estado)}</span></td>
    <td>${b.estado === 'disponible' ? `<button data-reservar="${b.id}">Reservar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function engancharReservas() {
  vista.querySelectorAll('[data-reservar]').forEach((b) => b.addEventListener('click', async () => {
    if (!sesion.usuario) { location.hash = '#/login'; return; }
    try { await api('/viajes/reservar', { metodo: 'POST', cuerpo: { bicicleta_id: Number(b.dataset.reservar) } }); aviso('Bicicleta reservada'); location.hash = '#/viaje'; }
    catch (e) { aviso(e.message, true); }
  }));
}

async function vistaBicicletas() {
  const est = await api('/estaciones');
  vista.innerHTML = `<h2>Bicicletas</h2>
    <form id="f" class="filtros">
      <div><label for="ft">Tipo</label><select id="ft"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label for="fe">Estación</label><select id="fe"><option value="">Todas</option>${est.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></div>
      <div><label for="fb">Batería mínima (%)</label><input id="fb" type="number" min="0" max="100" placeholder="0"></div>
      <label class="chk"><input id="fd" type="checkbox"> Solo disponibles</label>
      <button type="submit">Filtrar</button></form><div id="res"></div>`;
  const buscar = async () => {
    const p = new URLSearchParams();
    if ($('#ft').value) p.set('tipo', $('#ft').value);
    if ($('#fe').value) p.set('estacion_id', $('#fe').value);
    if ($('#fb').value) p.set('bateria_min', $('#fb').value);
    if ($('#fd').checked) p.set('solo_disponibles', 'true');
    const d = await api('/bicicletas?' + p);
    $('#res').innerHTML = `<p class="etq">${d.total} resultados</p>` + tablaBicis(d.resultados);
    engancharReservas();
  };
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); buscar().catch((x) => aviso(x.message, true)); });
  await buscar();
}

async function vistaEstacion(id) {
  const [e, resenas] = await Promise.all([api('/estaciones/' + id), api(`/estaciones/${id}/resenas`)]);
  const prom = resenas.length ? (resenas.reduce((a, r) => a + r.puntaje, 0) / resenas.length).toFixed(1) : '—';
  vista.innerHTML = `<a href="#/">← Estaciones</a><h1 style="margin-top:8px">${esc(e.nombre)}</h1>
    <p>${esc(e.comuna)} · ${esc(e.direccion)} · <span class="etq">★ ${prom}</span> · <span class="etq">${e.ocupados}/${e.capacidad} anclajes</span></p>
    <div class="cols"><div><h2>Bicicletas en la estación</h2>${tablaBicis(e.bicicletas.map((b) => ({ ...b, estacion: e.nombre })))}</div>
    <div class="caja"><h2>Reseñas</h2><div id="lista">${resenas.map((r) => `<div class="resena"><strong>${esc(r.autor)}</strong> <span class="etq">${'★'.repeat(r.puntaje) || '☆'}</span>
      <p style="margin:4px 0 0">${r.texto}</p></div>`).join('') || '<p>Aún no hay reseñas.</p>'}</div>
      ${sesion.usuario ? `<form id="fr"><label for="rt">Tu comentario</label><textarea id="rt" rows="3" maxlength="280" required></textarea>
      <label for="rp">Puntaje (1 a 5)</label><input id="rp" type="number" min="1" max="5" value="5"><p class="error" id="re"></p><button>Publicar</button></form>`
      : '<p><a href="#/login">Inicia sesión</a> para comentar.</p>'}</div></div>`;
  engancharReservas();
  const fr = $('#fr');
  if (fr) fr.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api(`/estaciones/${id}/resenas`, { metodo: 'POST', cuerpo: { texto: $('#rt').value, puntaje: Number($('#rp').value) } }); aviso('Reseña publicada'); vistaEstacion(id); }
    catch (x) { $('#re').textContent = x.message; }
  });
}

async function vistaViaje() {
  if (!sesion.usuario) { location.hash = '#/login'; return; }
  const [viajes, est] = await Promise.all([api('/viajes'), api('/estaciones')]);
  const v = viajes.find((x) => x.estado === 'reservado' || x.estado === 'en_curso');
  let panel = `<div class="caja"><h2>No tienes un viaje activo</h2><p>Elige una bicicleta disponible para comenzar.</p><a class="btn" href="#/bicicletas">Ver bicicletas</a></div>`;
  if (v) {
    const paso = v.estado === 'reservado' ? 1 : 2;
    panel = `<div class="caja"><h2>Viaje #${v.id}</h2>
      <div class="estado-viaje"><div class="paso on">Reservado</div><div class="paso ${paso >= 2 ? 'on' : ''}">En curso</div><div class="paso">Finalizado</div></div>
      ${v.estado === 'reservado' ? `<p class="aviso">Código de desbloqueo: <strong>${esc(v.codigo_desbloqueo)}</strong> (la reserva dura 10 minutos)</p>
        <label for="cod">Ingresa el código en la bicicleta</label><input id="cod" inputmode="numeric" maxlength="4"><p class="error" id="ve"></p>
        <button id="ini">Desbloquear</button> <button id="can" class="sec">Cancelar reserva</button>`
      : `<p>Viaje iniciado: ${new Date(v.inicio).toLocaleTimeString('es-CL')}</p>
        <label for="dest">Estación de devolución</label><select id="dest">${est.map((e) => `<option value="${e.id}">${esc(e.nombre)} (${e.ocupados}/${e.capacidad})</option>`).join('')}</select>
        <label for="cup">Cupón (opcional)</label><input id="cup" placeholder="VERANO10"><p class="error" id="ve"></p>
        <button id="fin">Finalizar y pagar</button>`}</div>`;
  }
  vista.innerHTML = `<h1>Mi viaje</h1>${panel}<h2 style="margin-top:28px">Historial</h2>
    <div class="tabla"><table><thead><tr><th>#</th><th>Estado</th><th>Duración</th><th>Costo</th><th>Cupón</th><th>Comprobante</th></tr></thead><tbody>
    ${viajes.map((x) => `<tr><td>${x.id}</td><td><span class="etq">${esc(x.estado)}</span></td><td>${x.minutos ?? '—'} min</td><td>${x.costo == null ? '—' : CLP(x.costo)}</td><td>${esc(x.cupon || '—')}</td>
    <td>${x.estado === 'finalizado' ? `<a href="/api/comprobantes/descargar?archivo=comprobante_${x.id}.txt" target="_blank" rel="noopener">Descargar</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  const accion = (id, ruta, cuerpo, ok) => $(id) && $(id).addEventListener('click', async () => {
    try { const d = await api(ruta, { metodo: 'POST', cuerpo: cuerpo() }); aviso(ok(d)); vistaViaje(); }
    catch (e) { $('#ve').textContent = e.message; }
  });
  if (v) {
    accion('#ini', `/viajes/${v.id}/iniciar`, () => ({ codigo: $('#cod').value }), () => '¡Buen viaje!');
    accion('#can', `/viajes/${v.id}/cancelar`, () => ({}), () => 'Reserva cancelada');
    accion('#fin', `/viajes/${v.id}/finalizar`, () => ({ estacion_id: Number($('#dest').value), cupon: $('#cup').value.trim() || undefined }), (d) => `Viaje finalizado. Costo ${CLP(d.costo)}`);
  }
}

async function vistaBilletera() {
  if (!sesion.usuario) { location.hash = '#/login'; return; }
  const d = await api('/billetera');
  vista.innerHTML = `<h1>Billetera</h1><div class="cols"><div class="caja"><span style="color:var(--texto-2)">Saldo disponible</span><div class="saldo">${CLP(d.saldo)}</div>
    <form id="fr"><label for="mt">Monto a recargar (CLP)</label><input id="mt" type="number" min="1000" max="100000" step="500" value="10000"><p class="error" id="re"></p><button>Recargar</button></form></div>
    <div class="caja"><h2>Movimientos</h2><div class="tabla"><table><tbody>${d.movimientos.map((m) => `<tr><td>${esc(m.detalle)}<br><small style="color:var(--texto-2)">${new Date(m.creado).toLocaleString('es-CL')}</small></td>
    <td style="text-align:right;color:${m.monto < 0 ? 'var(--rojo)' : 'var(--menta)'}">${CLP(m.monto)}</td></tr>`).join('') || '<tr><td>Sin movimientos</td></tr>'}</tbody></table></div></div></div>`;
  $('#fr').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/billetera/recargar', { metodo: 'POST', cuerpo: { monto: Number($('#mt').value) } }); aviso('Recarga exitosa'); vistaBilletera(); }
    catch (x) { $('#re').textContent = x.message; }
  });
}

function formAuth(titulo, campos, enviar, pie) {
  vista.innerHTML = `<div class="caja centrado"><h1>${titulo}</h1><form id="fa">${campos.map(([id, et, tipo]) => `<label for="${id}">${et}</label><input id="${id}" type="${tipo || 'text'}" required>`).join('')}
    <p class="error" id="ae"></p><button style="width:100%">${titulo}</button></form><p style="margin-top:14px">${pie}</p></div>`;
  $('#fa').addEventListener('submit', async (e) => { e.preventDefault(); try { await enviar(); } catch (x) { $('#ae').textContent = x.message; } });
}

function vistaLogin() {
  formAuth('Ingresar', [['em', 'Correo electrónico', 'text'], ['pw', 'Contraseña', 'password']], async () => {
    const d = await api('/auth/login', { metodo: 'POST', cuerpo: { email: $('#em').value, password: $('#pw').value } });
    guardarSesion(d.token, d.usuario); aviso('Bienvenido/a ' + d.usuario.nombre); location.hash = '#/';
  }, '<a href="#/recuperar">¿Olvidaste tu contraseña?</a> · <a href="#/registro">Crear cuenta</a>');
}

function vistaRegistro() {
  formAuth('Crear cuenta', [['nm', 'Nombre completo'], ['em', 'Correo electrónico', 'email'], ['rt', 'RUT (ej: 12345678-5)'], ['pw', 'Contraseña', 'password']], async () => {
    const d = await api('/auth/registro', { metodo: 'POST', cuerpo: { nombre: $('#nm').value, email: $('#em').value, rut: $('#rt').value, password: $('#pw').value } });
    guardarSesion(d.token, d.usuario); aviso('Cuenta creada'); location.hash = '#/';
  }, '¿Ya tienes cuenta? <a href="#/login">Ingresa</a>');
}

function vistaRecuperar() {
  formAuth('Recuperar acceso', [['em', 'Correo electrónico', 'email']], async () => {
    const d = await api('/auth/recuperar', { metodo: 'POST', cuerpo: { email: $('#em').value } });
    aviso(d.mensaje);
  }, '<a href="#/login">Volver</a>');
}

async function vistaPerfil() {
  if (!sesion.usuario) { location.hash = '#/login'; return; }
  const p = await api('/perfil');
  vista.innerHTML = `<div class="caja centrado"><h1>Mi perfil</h1><p><span class="etq">${esc(p.tipo)}</span> <span class="etq">${esc(p.rol)}</span></p>
    <form id="fp"><label>Correo</label><input value="${esc(p.email)}" disabled><label>RUT</label><input value="${esc(p.rut)}" disabled>
    <label for="nm">Nombre</label><input id="nm" value="${esc(p.nombre)}"><label for="tl">Teléfono</label><input id="tl" value="${esc(p.telefono)}">
    <p class="error" id="pe"></p><button>Guardar cambios</button></form></div>`;
  $('#fp').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const d = await api('/perfil', { metodo: 'PATCH', cuerpo: { nombre: $('#nm').value, telefono: $('#tl').value } }); guardarSesion(sesion.token, { ...sesion.usuario, nombre: d.nombre }); aviso('Perfil actualizado'); }
    catch (x) { $('#pe').textContent = x.message; }
  });
}

async function vistaAdmin() {
  if (!sesion.usuario || sesion.usuario.rol !== 'admin') { vista.innerHTML = '<div class="caja centrado"><h2>Acceso restringido</h2><p>Esta sección es solo para administradores.</p></div>'; return; }
  const [us, res] = await Promise.all([api('/admin/usuarios'), api('/admin/resumen')]);
  vista.innerHTML = `<h1>Administración</h1><div class="cifras" style="margin-bottom:22px"><div class="cifra"><b>${res.usuarios}</b><span>usuarios</span></div><div class="cifra"><b>${res.viajes}</b><span>viajes</span></div><div class="cifra"><b>${CLP(res.ingresos)}</b><span>ingresos</span></div></div>
    <div class="tabla"><table><thead><tr><th>#</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Tipo</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>${us.map((u) => `<tr><td>${u.id}</td><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td>${esc(u.rol)}</td><td>${esc(u.tipo)}</td><td>${CLP(u.saldo)}</td>
    <td><span class="etq ${u.estado === 'activo' ? 'ok' : 'mal'}">${esc(u.estado)}</span></td><td><button class="sec" data-est="${u.id}:${u.estado === 'activo' ? 'bloqueado' : 'activo'}">${u.estado === 'activo' ? 'Bloquear' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div>`;
  vista.querySelectorAll('[data-est]').forEach((b) => b.addEventListener('click', async () => {
    const [id, estado] = b.dataset.est.split(':');
    try { await api(`/admin/usuarios/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado } }); vistaAdmin(); } catch (e) { aviso(e.message, true); }
  }));
}

// ---------- Router ----------
async function enrutar() {
  const [ruta, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs || '');
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + ruta));
  try {
    let m;
    if (ruta === '/') await vistaInicio();
    else if (ruta === '/buscar') { await vistaBuscar(params); }
    else if (ruta === '/bicicletas') await vistaBicicletas();
    else if ((m = ruta.match(/^\/estacion\/(\d+)$/))) await vistaEstacion(m[1]);
    else if (ruta === '/viaje') await vistaViaje();
    else if (ruta === '/billetera') await vistaBilletera();
    else if (ruta === '/login') vistaLogin();
    else if (ruta === '/registro') vistaRegistro();
    else if (ruta === '/recuperar') vistaRecuperar();
    else if (ruta === '/perfil') await vistaPerfil();
    else if (ruta === '/admin') await vistaAdmin();
    else if (ruta === '/salir') { guardarSesion(null, null); location.hash = '#/'; return; }
    else vista.innerHTML = '<div class="caja centrado"><h2>Página no encontrada</h2><a href="#/">Volver al inicio</a></div>';
  } catch (e) {
    if (e.estado === 401) { guardarSesion(null, null); location.hash = '#/login'; return; }
    vista.innerHTML = `<div class="caja centrado"><h2>Ocurrió un error</h2><p>${esc(e.message)}</p></div>`;
  }
  if (ruta === '/buscar') engancharReservas();
}

$('#busqueda').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/buscar?q=' + encodeURIComponent($('#q').value); });
addEventListener('hashchange', enrutar);
pintarMenu();
enrutar();
