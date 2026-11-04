import { crearApiBackend, CAPACIDADES_BACKEND } from './backend.js';

export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'false') === 'true';
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const CLAVE_SESION = 'torneo-ucu-sesion';

export class ApiError extends Error {
  constructor(status, mensaje, campos) {
    super(mensaje);
    this.status = status;
    this.campos = campos || null;
  }
}

export function leerSesion() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_SESION)) || null; } catch { return null; }
}
export function guardarSesion(s) {
  try {
    if (s) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    else sessionStorage.removeItem(CLAVE_SESION);
  } catch { /* ignorar */ }
}

let alVencerSesion = () => {};
export function onSesionVencida(fn) { alVencerSesion = fn; }

const limpiarQuery = (q) => Object.fromEntries(Object.entries(q || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// Mensaje de error legible a partir de la respuesta
function mensajeDeError(status, datos, texto) {
  let msg = datos?.error ?? datos?.mensaje ?? datos?.message;
  if (Array.isArray(msg)) msg = msg.join('. ');
  if (!msg && texto) {
    // Flask en modo debug devuelve una página HTML: usamos su <title>
    const t = texto.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    if (t) msg = `Error del servidor (${status}): ${t.replace(/\s*\/\/\s*Werkzeug Debugger/, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()}`;
  }
  msg = String(msg || `Error ${status}`);
  // Errores de MySQL: "1644 (45000): El plantel ya tiene..." -> "El plantel ya tiene..."
  return msg.replace(/^\d{4} \(\w{5}\): /, '');
}

// Pedido HTTP a la API
async function http(metodo, path, { body, query } = {}) {
  const token = leerSesion()?.token;
  const qs = new URLSearchParams(limpiarQuery(query)).toString();
  let res;
  try {
    res = await fetch(`${API_URL}${path}${qs ? `?${qs}` : ''}`, {
      method: metodo,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Está corriendo el backend?');
  }
  const texto = res.status === 204 ? '' : await res.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { /* no era JSON */ }
  if (!res.ok) {
    if (res.status === 502 || res.status === 504) throw new ApiError(0, 'No se pudo conectar con el backend. ¿Está corriendo en el puerto 5000?');
    const error = new ApiError(res.status, mensajeDeError(res.status, datos, texto));
    if (res.status === 401 && path !== '/auth/login') alVencerSesion();
    throw error;
  }
  return datos;
}

async function requestMock(metodo, path, { body, query } = {}) {
  try {
    const { mockFetch } = await import('../mock/server.js');
    return await mockFetch(metodo, path, { body, query: limpiarQuery(query), token: leerSesion()?.token });
  } catch (e) {
    const error = e?.status ? new ApiError(e.status, e.message, e.campos) : new ApiError(0, e?.message || 'Error');
    if (error.status === 401 && path !== '/auth/login') alVencerSesion();
    throw error;
  }
}

const recurso = (base) => ({
  listar: (query) => requestMock('GET', base, { query }),
  obtener: (id) => requestMock('GET', `${base}/${encodeURIComponent(id)}`),
  crear: (body) => requestMock('POST', base, { body }),
  modificar: (id, body) => requestMock('PUT', `${base}/${encodeURIComponent(id)}`, { body }),
  eliminar: (id) => requestMock('DELETE', `${base}/${encodeURIComponent(id)}`),
});

const apiMock = {
  login: (correo, contrasena) => requestMock('POST', '/auth/login', { body: { correo, contrasena } }),
  facultades: () => requestMock('GET', '/facultades'),
  turnos: () => requestMock('GET', '/turnos'),
  torneos: recurso('/torneos'),
  jugadores: recurso('/jugadores'),
  equipos: recurso('/equipos'),
  plantel: {
    listar: (idEquipo) => requestMock('GET', `/equipos/${idEquipo}/plantel`),
    agregar: (idEquipo, body) => requestMock('POST', `/equipos/${idEquipo}/plantel`, { body }),
    modificar: (idEquipo, ci, body) => requestMock('PUT', `/equipos/${idEquipo}/plantel/${ci}`, { body }),
    quitar: (idEquipo, ci) => requestMock('DELETE', `/equipos/${idEquipo}/plantel/${ci}`),
  },
  complejos: recurso('/complejos'),
  canchas: {
    listar: (query) => requestMock('GET', '/canchas', { query }),
    crear: (body) => requestMock('POST', '/canchas', { body }),
    modificar: (idComplejo, nombre, body) => requestMock('PUT', `/complejos/${idComplejo}/canchas/${encodeURIComponent(nombre)}`, { body }),
    eliminar: (idComplejo, nombre) => requestMock('DELETE', `/complejos/${idComplejo}/canchas/${encodeURIComponent(nombre)}`),
  },
  partidos: {
    ...recurso('/partidos'),
    cambiarEstado: (id, estado) => requestMock('PATCH', `/partidos/${id}/estado`, { body: { estado } }),
    planilla: (id) => requestMock('GET', `/partidos/${id}/planilla`),
    guardarPlanilla: (id, jugadores) => requestMock('PUT', `/partidos/${id}/planilla`, { body: { jugadores } }),
    agregarGol: (id, body) => requestMock('POST', `/partidos/${id}/goles`, { body }),
    agregarTarjeta: (id, body) => requestMock('POST', `/partidos/${id}/tarjetas`, { body }),
  },
  eliminarGol: (id) => requestMock('DELETE', `/goles/${id}`),
  eliminarTarjeta: (id) => requestMock('DELETE', `/tarjetas/${id}`),
  sanciones: recurso('/sanciones'),
  reporte: (clave, idTorneo) => requestMock('GET', `/reportes/${clave}`, { query: { id_torneo: idTorneo } }),
};

export const api = USE_MOCK ? apiMock : crearApiBackend(http, ApiError);

// Acciones disponibles según la API en uso
export const CAPACIDADES = USE_MOCK
  ? { borrarEventos: true, corregirPlanilla: true, marcarJugadoManual: true }
  : CAPACIDADES_BACKEND;
