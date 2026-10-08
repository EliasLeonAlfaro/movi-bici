// Definición OpenAPI 3 de la API de MoviBici (se sirve en /api/openapi.json y se visualiza en /docs).
const B = (props, req = []) => ({ required: true, content: { 'application/json': { schema: { type: 'object', required: req, properties: props } } } });
const S = { type: 'string' };
const N = { type: 'integer' };

const op = (resumen, { auth = false, body, query = [], path = [] } = {}) => ({
  summary: resumen,
  ...(auth ? { security: [{ bearer: [] }] } : {}),
  parameters: [
    ...path.map((n) => ({ name: n, in: 'path', required: true, schema: N })),
    ...query.map((n) => ({ name: n, in: 'query', required: false, schema: S })),
  ],
  ...(body ? { requestBody: body } : {}),
  responses: { 200: { description: 'OK' }, 400: { description: 'Solicitud inválida' }, 401: { description: 'No autenticado' } },
});

module.exports = {
  openapi: '3.0.3',
  info: { title: 'MoviBici API', version: '0.9.0-rc1', description: 'API REST de la plataforma de bicicletas compartidas MoviBici (sistema bajo prueba).' },
  servers: [{ url: '/' }],
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  paths: {
    '/api/auth/registro': { post: op('Registrar un usuario', { body: B({ nombre: S, email: S, rut: S, password: S }, ['nombre', 'email', 'rut', 'password']) }) },
    '/api/auth/login': { post: op('Iniciar sesión', { body: B({ email: S, password: S }, ['email', 'password']) }) },
    '/api/auth/yo': { get: op('Usuario de la sesión', { auth: true }) },
    '/api/auth/recuperar': { post: op('Solicitar recuperación de contraseña', { body: B({ email: S }, ['email']) }) },
    '/api/auth/restablecer': { post: op('Restablecer contraseña con token', { body: B({ token: S, nueva: S }, ['token', 'nueva']) }) },
    '/api/estaciones': { get: op('Listar estaciones con disponibilidad') },
    '/api/estaciones/{id}': { get: op('Detalle de una estación y sus bicicletas', { path: ['id'] }) },
    '/api/estaciones/{id}/resenas': {
      get: op('Reseñas de una estación', { path: ['id'] }),
      post: op('Publicar una reseña', { auth: true, path: ['id'], body: B({ texto: S, puntaje: N }, ['texto', 'puntaje']) }),
    },
    '/api/bicicletas': { get: op('Buscar bicicletas', { query: ['q', 'tipo', 'estacion_id', 'bateria_min', 'solo_disponibles'] }) },
    '/api/viajes/reservar': { post: op('Reservar una bicicleta', { auth: true, body: B({ bicicleta_id: N }, ['bicicleta_id']) }) },
    '/api/viajes/{id}/iniciar': { post: op('Desbloquear e iniciar el viaje', { auth: true, path: ['id'], body: B({ codigo: S }, ['codigo']) }) },
    '/api/viajes/{id}/finalizar': { post: op('Devolver la bicicleta y cobrar', { auth: true, path: ['id'], body: B({ estacion_id: N, cupon: S }, ['estacion_id']) }) },
    '/api/viajes/{id}/cancelar': { post: op('Cancelar el viaje', { auth: true, path: ['id'] }) },
    '/api/viajes': { get: op('Mis viajes', { auth: true }) },
    '/api/viajes/{id}': { get: op('Detalle de un viaje', { auth: true, path: ['id'] }) },
    '/api/billetera': { get: op('Saldo y movimientos', { auth: true }) },
    '/api/billetera/recargar': { post: op('Recargar saldo', { auth: true, body: B({ monto: N }, ['monto']) }) },
    '/api/perfil': {
      get: op('Mi perfil', { auth: true }),
      patch: op('Actualizar mi perfil', { auth: true, body: B({ nombre: S, telefono: S }) }),
    },
    '/api/usuarios/{id}': { get: op('Datos públicos de un usuario', { auth: true, path: ['id'] }) },
    '/api/admin/usuarios': { get: op('Listado de usuarios (administración)', { auth: true }) },
    '/api/admin/usuarios/{id}/estado': { patch: op('Bloquear o activar un usuario', { auth: true, path: ['id'], body: B({ estado: S }, ['estado']) }) },
    '/api/admin/resumen': { get: op('Indicadores generales (administración)', { auth: true }) },
    '/api/comprobantes/descargar': { get: op('Descargar comprobante de viaje', { query: ['archivo'] }) },
    '/api/salud': { get: op('Estado del servicio') },
  },
};
