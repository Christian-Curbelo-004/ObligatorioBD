import { crearSeed } from './seed.js';
import {
  nextId, horarioPartido, yaSeJugoElHorario, dentroDeVentanaCorreccion, estaSuspendido,
  sancionesQueCubren, plantelDe, equipoDeJugadorEnTorneo, resultado, recalcularSancionesAutomaticas,
  HORAS_CORRECCION,
} from './reglas.js';
import { calcularReporte } from './reportes.js';

const CLAVE = 'torneo-ucu-mock-v3';
let db = null;

function cargar() {
  if (db) return db;
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) db = JSON.parse(guardado);
  } catch { /* storage bloqueado: seguimos en memoria */ }
  if (!db) { db = crearSeed(); guardar(); }
  return db;
}
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* ignorar */ }
}
export function reiniciarMock() {
  db = crearSeed();
  guardar();
}

export class HttpError extends Error {
  constructor(status, mensaje, campos) {
    super(mensaje);
    this.status = status;
    this.campos = campos;
  }
}
const err = (status, mensaje, campos) => { throw new HttpError(status, mensaje, campos); };
const noEncontrado = (que) => err(404, `${que} no existe.`);

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_CI = /^\d{7,8}$/;
const TIPOS_JUGADOR = ['grado', 'posgrado', 'docente', 'funcionario'];
const ESTADOS_TORNEO = ['inscripcion', 'en curso', 'finalizado'];
const ESTADOS_PARTIDO = ['programado', 'jugado', 'postergado', 'cancelado'];

function requerir(body, campos) {
  const faltan = {};
  for (const c of campos) {
    if (body[c] === undefined || body[c] === null || String(body[c]).trim() === '') faltan[c] = 'Obligatorio';
  }
  if (Object.keys(faltan).length) err(400, 'Faltan campos obligatorios.', faltan);
}

const torneo = (id) => db.torneo.find((t) => t.id_torneo === Number(id));
const equipo = (id) => db.equipo.find((e) => e.id_equipo === Number(id));
const jugador = (ci) => db.jugador.find((j) => j.ci === String(ci));
const partido = (id) => db.partido.find((p) => p.id_partido === Number(id));
const facultad = (id) => db.facultad.find((f) => f.id_facultad === Number(id));
const nombreCompleto = (ci) => { const j = jugador(ci); return j ? `${j.nombre} ${j.apellido}` : ci; };

function partidoExpandido(p) {
  const t = db.turno.find((x) => x.id_turno === p.id_turno);
  const cx = db.complejo.find((c) => c.id_complejo === p.id_complejo);
  const { fin } = horarioPartido(db, p);
  return {
    ...p,
    equipo_local: equipo(p.id_equipo_local)?.nombre,
    equipo_visitante: equipo(p.id_equipo_visitante)?.nombre,
    hora_inicio: t?.hora_inicio, hora_fin: t?.hora_fin,
    complejo: cx?.nombre,
    ...(p.estado === 'jugado' ? resultado(db, p) : { goles_local: null, goles_visitante: null }),
    horario_cumplido: yaSeJugoElHorario(db, p),
    corregible_hasta: fin ? new Date(fin.getTime() + HORAS_CORRECCION * 3600e3).toISOString() : null,
  };
}

function equipoExpandido(e) {
  const plantel = plantelDe(db, e.id_equipo);
  return {
    ...e,
    torneo: torneo(e.id_torneo)?.nombre,
    facultad: facultad(e.id_facultad)?.nombre,
    capitan: e.ci_capitan ? nombreCompleto(e.ci_capitan) : null,
    cantidad_jugadores: plantel.length,
  };
}

function validarPartido(body, idActual = null) {
  requerir(body, ['id_torneo', 'numero_fecha', 'id_equipo_local', 'id_equipo_visitante', 'dia', 'id_turno', 'nombre_cancha', 'id_complejo']);
  const p = {
    id_torneo: Number(body.id_torneo), numero_fecha: Number(body.numero_fecha),
    id_equipo_local: Number(body.id_equipo_local), id_equipo_visitante: Number(body.id_equipo_visitante),
    dia: body.dia, id_turno: Number(body.id_turno), nombre_cancha: body.nombre_cancha,
    id_complejo: Number(body.id_complejo), estado: body.estado || 'programado',
  };
  if (!torneo(p.id_torneo)) noEncontrado('El torneo');
  if (torneo(p.id_torneo).estado === 'finalizado') err(409, 'El torneo está finalizado: no se pueden programar partidos.');
  if (!Number.isInteger(p.numero_fecha) || p.numero_fecha < 1) err(400, 'La fecha del torneo debe ser un entero mayor o igual a 1.', { numero_fecha: 'Inválido' });
  if (!ESTADOS_PARTIDO.includes(p.estado)) err(400, 'Estado de partido inválido.', { estado: 'Inválido' });
  if (!db.turno.some((t) => t.id_turno === p.id_turno)) err(400, 'El turno no existe (turnos válidos: 18:00 a 23:00).', { id_turno: 'Inválido' });
  if (!db.cancha.some((c) => c.nombre_cancha === p.nombre_cancha && c.id_complejo === p.id_complejo)) err(400, 'La cancha no existe en ese complejo.', { nombre_cancha: 'Inválido' });

  const L = equipo(p.id_equipo_local), V = equipo(p.id_equipo_visitante);
  if (!L || !V) noEncontrado('Uno de los equipos');
  if (L.id_equipo === V.id_equipo) err(409, 'Un equipo no puede enfrentarse a sí mismo.', { id_equipo_visitante: 'Mismo equipo' });
  if (L.id_torneo !== p.id_torneo || V.id_torneo !== p.id_torneo) err(409, 'Ambos equipos deben pertenecer a la edición del torneo seleccionada.');
  for (const e of [L, V]) {
    if (plantelDe(db, e.id_equipo).length < 5) err(409, `${e.nombre} tiene menos de 5 jugadores en su plantel.`);
  }
  const activos = db.partido.filter((x) => x.id_partido !== idActual && x.estado !== 'cancelado');
  const yaSeEnfrentaron = activos.find((x) => x.id_torneo === p.id_torneo
    && ((x.id_equipo_local === L.id_equipo && x.id_equipo_visitante === V.id_equipo)
      || (x.id_equipo_local === V.id_equipo && x.id_equipo_visitante === L.id_equipo)));
  if (yaSeEnfrentaron) err(409, `${L.nombre} y ${V.nombre} ya tienen un partido en esta edición (fecha ${yaSeEnfrentaron.numero_fecha}).`);
  for (const e of [L, V]) {
    const misma = activos.find((x) => x.id_torneo === p.id_torneo && x.numero_fecha === p.numero_fecha
      && (x.id_equipo_local === e.id_equipo || x.id_equipo_visitante === e.id_equipo));
    if (misma) err(409, `${e.nombre} ya juega en la fecha ${p.numero_fecha}.`);
  }
  const ocupada = activos.find((x) => x.nombre_cancha === p.nombre_cancha && x.id_complejo === p.id_complejo
    && x.dia === p.dia && x.id_turno === p.id_turno);
  if (ocupada) err(409, `La cancha ya tiene un partido ese día y turno (partido #${ocupada.id_partido}).`);
  if (p.estado === 'jugado' && !yaSeJugoElHorario(db, p)) err(409, 'Un partido solo puede marcarse como jugado si su día y turno ya pasaron.');
  return p;
}

function puedeEditarPlanilla(p) {
  if (p.estado === 'cancelado' || p.estado === 'postergado') err(409, `El partido está ${p.estado}: no se registra planilla.`);
  if (!yaSeJugoElHorario(db, p)) err(409, 'La planilla se registra una vez disputado el partido (su día y turno todavía no pasaron).');
  if (p.estado === 'jugado' && !dentroDeVentanaCorreccion(db, p)) err(409, `Pasaron más de ${HORAS_CORRECCION} horas desde el partido: el resultado ya no se puede corregir.`);
}

const rutas = [];
const ruta = (metodo, patron, handler, { soloAdmin = false } = {}) => {
  const claves = [];
  const re = new RegExp('^' + patron.replace(/:(\w+)/g, (_, k) => { claves.push(k); return '([^/]+)'; }) + '$');
  rutas.push({ metodo, re, claves, handler, soloAdmin });
};

// Auth
ruta('POST', '/auth/login', ({ body }) => {
  requerir(body, ['correo', 'contrasena']);
  const u = db.login.find((x) => x.correo.toLowerCase() === String(body.correo).toLowerCase() && x.contrasena === body.contrasena);
  if (!u) err(401, 'Correo o contraseña incorrectos.');
  return { token: `mock.${btoa(u.correo)}.${u.rol}`, correo: u.correo, rol: u.rol };
});

// Catálogos
ruta('GET', '/facultades', () => db.facultad);
ruta('GET', '/turnos', () => db.turno);

// Torneos
ruta('GET', '/torneos', () => [...db.torneo].sort((a, b) => b.anio - a.anio || b.semestre - a.semestre));
ruta('POST', '/torneos', ({ body }) => {
  requerir(body, ['nombre', 'anio', 'semestre', 'fecha_inicio', 'fecha_fin', 'estado']);
  validarTorneo(body);
  if (db.torneo.some((t) => Number(t.anio) === Number(body.anio) && Number(t.semestre) === Number(body.semestre))) err(409, 'Ya existe una edición para ese año y semestre.');
  const t = { ...pick(body, ['nombre', 'fecha_inicio', 'fecha_fin', 'estado']), anio: Number(body.anio), semestre: Number(body.semestre), id_torneo: nextId(db, 'torneo', 'id_torneo') };
  db.torneo.push(t);
  return t;
}, { soloAdmin: true });
ruta('PUT', '/torneos/:id', ({ params, body }) => {
  const t = torneo(params.id) || noEncontrado('El torneo');
  requerir(body, ['nombre', 'anio', 'semestre', 'fecha_inicio', 'fecha_fin', 'estado']);
  validarTorneo(body);
  if (db.torneo.some((x) => x.id_torneo !== t.id_torneo && Number(x.anio) === Number(body.anio) && Number(x.semestre) === Number(body.semestre))) err(409, 'Ya existe una edición para ese año y semestre.');
  const orden = ESTADOS_TORNEO;
  if (orden.indexOf(body.estado) < orden.indexOf(t.estado)) err(409, `Un torneo ${t.estado} no puede volver a ${body.estado}.`);
  Object.assign(t, pick(body, ['nombre', 'fecha_inicio', 'fecha_fin', 'estado']), { anio: Number(body.anio), semestre: Number(body.semestre) });
  return t;
}, { soloAdmin: true });
ruta('DELETE', '/torneos/:id', ({ params }) => {
  const t = torneo(params.id) || noEncontrado('El torneo');
  if (db.equipo.some((e) => e.id_torneo === t.id_torneo)) err(409, 'El torneo tiene equipos inscriptos: no se puede eliminar.');
  db.torneo = db.torneo.filter((x) => x !== t);
  return { ok: true };
}, { soloAdmin: true });

function validarTorneo(b) {
  if (!ESTADOS_TORNEO.includes(b.estado)) err(400, 'Estado inválido.', { estado: 'Inválido' });
  if (![1, 2].includes(Number(b.semestre))) err(400, 'El semestre debe ser 1 o 2.', { semestre: 'Inválido' });
  if (Number(b.anio) < 2000 || Number(b.anio) > 2100) err(400, 'Año inválido.', { anio: 'Inválido' });
  if (b.fecha_fin < b.fecha_inicio) err(400, 'La fecha de fin no puede ser anterior a la de inicio.', { fecha_fin: 'Anterior al inicio' });
}

// Jugadores
ruta('GET', '/jugadores', ({ query }) => {
  let lista = db.jugador.map((j) => ({ ...j, facultad: facultad(j.id_facultad)?.nombre }));
  if (query.id_facultad) lista = lista.filter((j) => j.id_facultad === Number(query.id_facultad));
  if (query.tipo) lista = lista.filter((j) => j.tipo === query.tipo);
  if (query.q) {
    const q = query.q.toLowerCase();
    lista = lista.filter((j) => `${j.nombre} ${j.apellido} ${j.ci} ${j.email}`.toLowerCase().includes(q));
  }
  return lista.sort((a, b) => a.apellido.localeCompare(b.apellido));
});
ruta('POST', '/jugadores', ({ body }) => {
  validarJugador(body);
  if (jugador(body.ci)) err(409, 'Ya existe un jugador con esa CI.', { ci: 'Duplicada' });
  if (db.jugador.some((j) => j.email.toLowerCase() === body.email.toLowerCase())) err(409, 'Ya existe un jugador con ese email.', { email: 'Duplicado' });
  const j = { ...pick(body, ['ci', 'nombre', 'apellido', 'email', 'fecha_nacimiento', 'tipo']), id_facultad: Number(body.id_facultad) };
  db.jugador.push(j);
  return j;
}, { soloAdmin: true });
ruta('PUT', '/jugadores/:ci', ({ params, body }) => {
  const j = jugador(params.ci) || noEncontrado('El jugador');
  validarJugador({ ...body, ci: j.ci });
  if (db.jugador.some((x) => x !== j && x.email.toLowerCase() === body.email.toLowerCase())) err(409, 'Ya existe un jugador con ese email.', { email: 'Duplicado' });
  const enPlanteles = db.equipo_jugador_torneo.filter((p) => p.ci_jugador === j.ci);
  if (Number(body.id_facultad) !== j.id_facultad && enPlanteles.length) err(409, 'El jugador integra un plantel: no se puede cambiar su facultad.');
  if (['docente', 'funcionario'].includes(body.tipo) && !['docente', 'funcionario'].includes(j.tipo)) {
    for (const p of enPlanteles) {
      const n = plantelDe(db, p.id_equipo).filter((x) => ['docente', 'funcionario'].includes(jugador(x.ci_jugador)?.tipo)).length;
      if (n >= 2) err(409, `Su equipo ${equipo(p.id_equipo).nombre} ya tiene 2 docentes/funcionarios.`);
    }
  }
  Object.assign(j, pick(body, ['nombre', 'apellido', 'email', 'fecha_nacimiento', 'tipo']), { id_facultad: Number(body.id_facultad) });
  return j;
}, { soloAdmin: true });
ruta('DELETE', '/jugadores/:ci', ({ params }) => {
  const j = jugador(params.ci) || noEncontrado('El jugador');
  if (db.planilla_partido.some((p) => p.ci_jugador === j.ci)) err(409, 'El jugador figura en planillas de partidos: no se puede eliminar.');
  if (db.equipo_jugador_torneo.some((p) => p.ci_jugador === j.ci)) err(409, 'El jugador integra un plantel: quitalo del plantel primero.');
  if (db.equipo.some((e) => e.ci_capitan === j.ci)) err(409, 'El jugador es capitán de un equipo.');
  db.jugador = db.jugador.filter((x) => x !== j);
  db.sancion_jugador = db.sancion_jugador.filter((s) => s.ci_jugador !== j.ci);
  return { ok: true };
}, { soloAdmin: true });

function validarJugador(b) {
  requerir(b, ['ci', 'nombre', 'apellido', 'email', 'fecha_nacimiento', 'id_facultad', 'tipo']);
  if (!RE_CI.test(String(b.ci))) err(400, 'La CI debe tener 7 u 8 dígitos, sin puntos ni guiones.', { ci: 'Formato inválido' });
  if (!RE_EMAIL.test(b.email)) err(400, 'Email inválido.', { email: 'Formato inválido' });
  if (!TIPOS_JUGADOR.includes(b.tipo)) err(400, 'Tipo de jugador inválido.', { tipo: 'Inválido' });
  if (!facultad(b.id_facultad)) err(400, 'La facultad no existe.', { id_facultad: 'Inválida' });
  const nac = new Date(b.fecha_nacimiento);
  if (Number.isNaN(nac.getTime()) || nac >= new Date()) err(400, 'La fecha de nacimiento debe ser anterior a hoy.', { fecha_nacimiento: 'Inválida' });
  if (b.nombre.length > 100 || b.apellido.length > 100) err(400, 'Nombre y apellido: máximo 100 caracteres.');
  if (b.email.length > 120) err(400, 'Email: máximo 120 caracteres.', { email: 'Muy largo' });
}

// Equipos
ruta('GET', '/equipos', ({ query }) => {
  let lista = db.equipo;
  if (query.id_torneo) lista = lista.filter((e) => e.id_torneo === Number(query.id_torneo));
  return lista.map(equipoExpandido).sort((a, b) => a.nombre.localeCompare(b.nombre));
});
ruta('GET', '/equipos/:id', ({ params }) => equipoExpandido(equipo(params.id) || noEncontrado('El equipo')));
ruta('POST', '/equipos', ({ body }) => {
  requerir(body, ['nombre', 'id_torneo', 'id_facultad']);
  const t = torneo(body.id_torneo) || noEncontrado('El torneo');
  if (t.estado !== 'inscripcion') err(409, 'Solo se pueden inscribir equipos mientras el torneo está en inscripción.');
  if (!facultad(body.id_facultad)) err(400, 'La facultad no existe.');
  if (db.equipo.some((e) => e.id_torneo === t.id_torneo && e.nombre.toLowerCase() === body.nombre.trim().toLowerCase())) err(409, 'Ya hay un equipo con ese nombre en la edición.', { nombre: 'Duplicado' });
  const e = { id_equipo: nextId(db, 'equipo', 'id_equipo'), nombre: body.nombre.trim(), id_torneo: t.id_torneo, id_facultad: Number(body.id_facultad), ci_capitan: null };
  db.equipo.push(e);
  return equipoExpandido(e);
}, { soloAdmin: true });
ruta('PUT', '/equipos/:id', ({ params, body }) => {
  const e = equipo(params.id) || noEncontrado('El equipo');
  requerir(body, ['nombre']);
  const t = torneo(e.id_torneo);
  if (body.id_facultad && Number(body.id_facultad) !== e.id_facultad) {
    if (plantelDe(db, e.id_equipo).length) err(409, 'No se puede cambiar la facultad de un equipo con jugadores.');
    e.id_facultad = Number(body.id_facultad);
  }
  if (db.equipo.some((x) => x !== e && x.id_torneo === e.id_torneo && x.nombre.toLowerCase() === body.nombre.trim().toLowerCase())) err(409, 'Ya hay un equipo con ese nombre en la edición.', { nombre: 'Duplicado' });
  if (body.ci_capitan) {
    if (!plantelDe(db, e.id_equipo).some((p) => p.ci_jugador === body.ci_capitan)) err(409, 'El capitán debe ser un jugador del plantel.', { ci_capitan: 'No está en el plantel' });
  }
  if (t.estado === 'finalizado' && body.ci_capitan !== e.ci_capitan) err(409, 'El torneo está finalizado.');
  e.nombre = body.nombre.trim();
  e.ci_capitan = body.ci_capitan || null;
  return equipoExpandido(e);
}, { soloAdmin: true });
ruta('DELETE', '/equipos/:id', ({ params }) => {
  const e = equipo(params.id) || noEncontrado('El equipo');
  if (torneo(e.id_torneo).estado !== 'inscripcion') err(409, 'Solo se pueden dar de baja equipos durante la inscripción.');
  if (db.partido.some((p) => p.id_equipo_local === e.id_equipo || p.id_equipo_visitante === e.id_equipo)) err(409, 'El equipo tiene partidos programados.');
  db.equipo_jugador_torneo = db.equipo_jugador_torneo.filter((p) => p.id_equipo !== e.id_equipo);
  db.equipo = db.equipo.filter((x) => x !== e);
  return { ok: true };
}, { soloAdmin: true });

// Plantel
ruta('GET', '/equipos/:id/plantel', ({ params }) => {
  const e = equipo(params.id) || noEncontrado('El equipo');
  const fechaActual = Math.max(0, ...db.partido.filter((p) => p.id_torneo === e.id_torneo && p.estado === 'jugado').map((p) => p.numero_fecha)) + 1;
  return plantelDe(db, e.id_equipo).map((p) => {
    const j = jugador(p.ci_jugador);
    return {
      ...p, nombre: j?.nombre, apellido: j?.apellido, tipo: j?.tipo,
      es_capitan: e.ci_capitan === p.ci_jugador,
      suspendido_proxima_fecha: estaSuspendido(db, p.ci_jugador, e.id_torneo, fechaActual),
    };
  }).sort((a, b) => a.numero_camiseta - b.numero_camiseta);
});
function validarCambioPlantel(e) {
  if (torneo(e.id_torneo).estado !== 'inscripcion') err(409, 'Los planteles solo pueden modificarse mientras el torneo está en etapa de inscripción.');
}
ruta('POST', '/equipos/:id/plantel', ({ params, body }) => {
  const e = equipo(params.id) || noEncontrado('El equipo');
  validarCambioPlantel(e);
  requerir(body, ['ci_jugador', 'numero_camiseta']);
  const j = jugador(body.ci_jugador) || noEncontrado('El jugador');
  const num = Number(body.numero_camiseta);
  const plantel = plantelDe(db, e.id_equipo);
  if (!Number.isInteger(num) || num < 1 || num > 99) err(400, 'El número de camiseta debe estar entre 1 y 99.', { numero_camiseta: 'Fuera de rango' });
  if (plantel.length >= 10) err(409, 'El plantel ya tiene 10 jugadores (máximo).');
  if (j.id_facultad !== e.id_facultad) err(409, `${j.nombre} ${j.apellido} no pertenece a la facultad del equipo.`);
  const otro = equipoDeJugadorEnTorneo(db, j.ci, e.id_torneo);
  if (otro) err(409, `${j.nombre} ${j.apellido} ya integra ${equipo(otro).nombre} en esta edición.`);
  if (plantel.some((p) => p.numero_camiseta === num)) err(409, `La camiseta ${num} ya está asignada en el equipo.`, { numero_camiseta: 'Repetido' });
  if (['docente', 'funcionario'].includes(j.tipo)) {
    const n = plantel.filter((p) => ['docente', 'funcionario'].includes(jugador(p.ci_jugador)?.tipo)).length;
    if (n >= 2) err(409, 'El plantel ya tiene 2 docentes/funcionarios (máximo permitido).');
  }
  const fila = { id_equipo: e.id_equipo, ci_jugador: j.ci, id_torneo: e.id_torneo, numero_camiseta: num };
  db.equipo_jugador_torneo.push(fila);
  return fila;
}, { soloAdmin: true });
ruta('PUT', '/equipos/:id/plantel/:ci', ({ params, body }) => {
  const e = equipo(params.id) || noEncontrado('El equipo');
  validarCambioPlantel(e);
  const fila = plantelDe(db, e.id_equipo).find((p) => p.ci_jugador === params.ci) || noEncontrado('El jugador en el plantel');
  const num = Number(body.numero_camiseta);
  if (!Number.isInteger(num) || num < 1 || num > 99) err(400, 'El número de camiseta debe estar entre 1 y 99.');
  if (plantelDe(db, e.id_equipo).some((p) => p !== fila && p.numero_camiseta === num)) err(409, `La camiseta ${num} ya está asignada.`);
  fila.numero_camiseta = num;
  return fila;
}, { soloAdmin: true });
ruta('DELETE', '/equipos/:id/plantel/:ci', ({ params }) => {
  const e = equipo(params.id) || noEncontrado('El equipo');
  validarCambioPlantel(e);
  if (e.ci_capitan === params.ci) err(409, 'Es el capitán: elegí otro capitán antes de quitarlo.');
  db.equipo_jugador_torneo = db.equipo_jugador_torneo.filter((p) => !(p.id_equipo === e.id_equipo && p.ci_jugador === params.ci));
  return { ok: true };
}, { soloAdmin: true });

// Complejos y canchas
ruta('GET', '/complejos', () => db.complejo.map((c) => ({ ...c, cantidad_canchas: db.cancha.filter((k) => k.id_complejo === c.id_complejo).length })));
ruta('POST', '/complejos', ({ body }) => {
  requerir(body, ['nombre', 'direccion', 'departamento']);
  const c = { id_complejo: nextId(db, 'complejo', 'id_complejo'), ...pick(body, ['nombre', 'direccion', 'departamento']) };
  db.complejo.push(c);
  return c;
}, { soloAdmin: true });
ruta('PUT', '/complejos/:id', ({ params, body }) => {
  const c = db.complejo.find((x) => x.id_complejo === Number(params.id)) || noEncontrado('El complejo');
  requerir(body, ['nombre', 'direccion', 'departamento']);
  Object.assign(c, pick(body, ['nombre', 'direccion', 'departamento']));
  return c;
}, { soloAdmin: true });
ruta('DELETE', '/complejos/:id', ({ params }) => {
  const id = Number(params.id);
  if (db.partido.some((p) => p.id_complejo === id)) err(409, 'El complejo tiene partidos asignados.');
  db.cancha = db.cancha.filter((k) => k.id_complejo !== id);
  db.complejo = db.complejo.filter((c) => c.id_complejo !== id);
  return { ok: true };
}, { soloAdmin: true });
ruta('GET', '/canchas', ({ query }) => {
  let lista = db.cancha;
  if (query.id_complejo) lista = lista.filter((k) => k.id_complejo === Number(query.id_complejo));
  return lista.map((k) => ({ ...k, complejo: db.complejo.find((c) => c.id_complejo === k.id_complejo)?.nombre }));
});
ruta('POST', '/canchas', ({ body }) => {
  requerir(body, ['nombre_cancha', 'id_complejo', 'superficie']);
  if (!db.complejo.some((c) => c.id_complejo === Number(body.id_complejo))) noEncontrado('El complejo');
  if (!['sintetico', 'parquet'].includes(body.superficie)) err(400, 'Superficie inválida.', { superficie: 'Inválida' });
  if (db.cancha.some((k) => k.id_complejo === Number(body.id_complejo) && k.nombre_cancha.toLowerCase() === body.nombre_cancha.trim().toLowerCase())) err(409, 'Ya existe una cancha con ese nombre en el complejo.', { nombre_cancha: 'Duplicada' });
  const k = { nombre_cancha: body.nombre_cancha.trim(), id_complejo: Number(body.id_complejo), superficie: body.superficie, techada: Boolean(body.techada) };
  db.cancha.push(k);
  return k;
}, { soloAdmin: true });
ruta('PUT', '/complejos/:id/canchas/:nombre', ({ params, body }) => {
  const k = db.cancha.find((x) => x.id_complejo === Number(params.id) && x.nombre_cancha === params.nombre) || noEncontrado('La cancha');
  if (!['sintetico', 'parquet'].includes(body.superficie)) err(400, 'Superficie inválida.');
  k.superficie = body.superficie;
  k.techada = Boolean(body.techada);
  return k;
}, { soloAdmin: true });
ruta('DELETE', '/complejos/:id/canchas/:nombre', ({ params }) => {
  const id = Number(params.id);
  if (db.partido.some((p) => p.id_complejo === id && p.nombre_cancha === params.nombre)) err(409, 'La cancha tiene partidos asignados.');
  db.cancha = db.cancha.filter((k) => !(k.id_complejo === id && k.nombre_cancha === params.nombre));
  return { ok: true };
}, { soloAdmin: true });

// Partidos
ruta('GET', '/partidos', ({ query }) => {
  let lista = db.partido;
  if (query.id_torneo) lista = lista.filter((p) => p.id_torneo === Number(query.id_torneo));
  if (query.numero_fecha) lista = lista.filter((p) => p.numero_fecha === Number(query.numero_fecha));
  if (query.estado) lista = lista.filter((p) => p.estado === query.estado);
  return lista.map(partidoExpandido).sort((a, b) => a.numero_fecha - b.numero_fecha || a.dia.localeCompare(b.dia) || a.id_turno - b.id_turno);
});
ruta('GET', '/partidos/:id', ({ params }) => partidoExpandido(partido(params.id) || noEncontrado('El partido')));
ruta('POST', '/partidos', ({ body }) => {
  const p = validarPartido({ ...body, estado: 'programado' });
  p.id_partido = nextId(db, 'partido', 'id_partido');
  db.partido.push(p);
  return partidoExpandido(p);
}, { soloAdmin: true });
ruta('PUT', '/partidos/:id', ({ params, body }) => {
  const actual = partido(params.id) || noEncontrado('El partido');
  if (actual.estado === 'jugado') err(409, 'Un partido jugado no se puede reprogramar.');
  const p = validarPartido({ ...body, estado: actual.estado === 'cancelado' ? 'cancelado' : body.estado || actual.estado }, actual.id_partido);
  Object.assign(actual, p);
  return partidoExpandido(actual);
}, { soloAdmin: true });
ruta('PATCH', '/partidos/:id/estado', ({ params, body }) => {
  const p = partido(params.id) || noEncontrado('El partido');
  const nuevo = body.estado;
  if (!ESTADOS_PARTIDO.includes(nuevo)) err(400, 'Estado inválido.');
  if (p.estado === 'jugado' && nuevo !== 'jugado') err(409, 'Un partido jugado no puede cambiar de estado.');
  if (nuevo === 'jugado') {
    if (!yaSeJugoElHorario(db, p)) err(409, 'Un partido solo puede marcarse como jugado si su día y turno ya pasaron.');
    if (!db.planilla_partido.some((x) => x.id_partido === p.id_partido)) err(409, 'Registrá la planilla antes de marcar el partido como jugado.');
  }
  if (p.estado === 'cancelado' && nuevo !== 'cancelado') {
    validarPartido({ ...p, estado: 'programado' }, p.id_partido);
  }
  p.estado = nuevo;
  return partidoExpandido(p);
}, { soloAdmin: false }); // el planillero puede marcar jugado tras cargar la planilla; ver chequeo abajo
ruta('DELETE', '/partidos/:id', ({ params }) => {
  const p = partido(params.id) || noEncontrado('El partido');
  if (p.estado === 'jugado') err(409, 'Un partido jugado no puede eliminarse.');
  db.planilla_partido = db.planilla_partido.filter((x) => x.id_partido !== p.id_partido);
  db.gol = db.gol.filter((x) => x.id_partido !== p.id_partido);
  db.tarjeta = db.tarjeta.filter((x) => x.id_partido !== p.id_partido);
  db.partido = db.partido.filter((x) => x !== p);
  recalcularSancionesAutomaticas(db, p.id_torneo);
  return { ok: true };
}, { soloAdmin: true });

// Planilla, goles y tarjetas (administrador y planillero)
ruta('GET', '/partidos/:id/planilla', ({ params }) => {
  const p = partido(params.id) || noEncontrado('El partido');
  const fila = (ci, idEquipo) => {
    const j = jugador(ci);
    const pl = db.equipo_jugador_torneo.find((x) => x.ci_jugador === ci && x.id_equipo === idEquipo);
    const sanciones = sancionesQueCubren(db, ci, p.id_torneo, p.numero_fecha);
    return {
      ci, id_equipo: idEquipo, nombre: j?.nombre, apellido: j?.apellido, numero_camiseta: pl?.numero_camiseta,
      suspendido: sanciones.length > 0,
      motivo_suspension: sanciones.map((s) => s.motivo).join(', ') || null,
      en_planilla: db.planilla_partido.some((x) => x.id_partido === p.id_partido && x.ci_jugador === ci),
    };
  };
  let editable = true, motivo_no_editable = null;
  try { puedeEditarPlanilla(p); } catch (e) { editable = false; motivo_no_editable = e.message; }
  return {
    partido: partidoExpandido(p),
    editable, motivo_no_editable,
    local: plantelDe(db, p.id_equipo_local).map((x) => fila(x.ci_jugador, p.id_equipo_local)).sort((a, b) => a.numero_camiseta - b.numero_camiseta),
    visitante: plantelDe(db, p.id_equipo_visitante).map((x) => fila(x.ci_jugador, p.id_equipo_visitante)).sort((a, b) => a.numero_camiseta - b.numero_camiseta),
    goles: db.gol.filter((g) => g.id_partido === p.id_partido).map((g) => ({ ...g, jugador: nombreCompleto(g.ci_jugador), id_equipo: equipoEnPlanilla(p, g.ci_jugador) })).sort((a, b) => a.minuto - b.minuto),
    tarjetas: db.tarjeta.filter((t) => t.id_partido === p.id_partido).map((t) => ({ ...t, jugador: nombreCompleto(t.ci_jugador), id_equipo: equipoEnPlanilla(p, t.ci_jugador) })).sort((a, b) => a.minuto - b.minuto),
  };
});
const equipoEnPlanilla = (p, ci) => db.planilla_partido.find((x) => x.id_partido === p.id_partido && x.ci_jugador === ci)?.id_equipo ?? null;

ruta('PUT', '/partidos/:id/planilla', ({ params, body }) => {
  const p = partido(params.id) || noEncontrado('El partido');
  puedeEditarPlanilla(p);
  const lista = Array.isArray(body.jugadores) ? body.jugadores : err(400, 'Se espera { jugadores: [...] }.');
  const nuevas = [];
  for (const { ci_jugador, id_equipo } of lista) {
    const eq = Number(id_equipo);
    if (![p.id_equipo_local, p.id_equipo_visitante].includes(eq)) err(409, 'Solo pueden figurar jugadores de los dos equipos del partido.');
    if (!plantelDe(db, eq).some((x) => x.ci_jugador === ci_jugador)) err(409, `${nombreCompleto(ci_jugador)} no está en el plantel de ${equipo(eq).nombre}.`);
    if (estaSuspendido(db, ci_jugador, p.id_torneo, p.numero_fecha)) err(409, `${nombreCompleto(ci_jugador)} está suspendido para la fecha ${p.numero_fecha}.`);
    nuevas.push({ id_partido: p.id_partido, ci_jugador, id_equipo: eq });
  }
  const quedan = new Set(nuevas.map((x) => x.ci_jugador));
  const conEventos = [...db.gol, ...db.tarjeta].filter((x) => x.id_partido === p.id_partido && !quedan.has(x.ci_jugador));
  if (conEventos.length) err(409, `${nombreCompleto(conEventos[0].ci_jugador)} tiene goles o tarjetas registrados: borralos antes de quitarlo de la planilla.`);
  db.planilla_partido = db.planilla_partido.filter((x) => x.id_partido !== p.id_partido).concat(nuevas);
  return { ok: true, cantidad: nuevas.length };
});
function validarEvento(p, body) {
  puedeEditarPlanilla(p);
  requerir(body, ['ci_jugador', 'minuto']);
  const min = Number(body.minuto);
  if (!Number.isInteger(min) || min < 1 || min > 60) err(400, 'El minuto debe ser un entero entre 1 y 60.', { minuto: 'Fuera de rango' });
  if (equipoEnPlanilla(p, body.ci_jugador) === null) err(409, 'Solo pueden convertir goles o recibir tarjetas los jugadores que figuran en la planilla.');
  return min;
}
ruta('POST', '/partidos/:id/goles', ({ params, body }) => {
  const p = partido(params.id) || noEncontrado('El partido');
  const minuto = validarEvento(p, body);
  const g = { id_gol: nextId(db, 'gol', 'id_gol'), id_partido: p.id_partido, ci_jugador: body.ci_jugador, minuto, autogol: Boolean(body.autogol) };
  db.gol.push(g);
  return g;
});
ruta('DELETE', '/goles/:id', ({ params }) => {
  const g = db.gol.find((x) => x.id_gol === Number(params.id)) || noEncontrado('El gol');
  puedeEditarPlanilla(partido(g.id_partido));
  db.gol = db.gol.filter((x) => x !== g);
  return { ok: true };
});
ruta('POST', '/partidos/:id/tarjetas', ({ params, body }) => {
  const p = partido(params.id) || noEncontrado('El partido');
  const minuto = validarEvento(p, body);
  if (!['amarilla', 'roja'].includes(body.color)) err(400, 'Color inválido.', { color: 'Inválido' });
  if (db.tarjeta.some((t) => t.id_partido === p.id_partido && t.ci_jugador === body.ci_jugador && t.color === 'roja')) err(409, 'El jugador ya fue expulsado en este partido.');
  const t = { id_tarjeta: nextId(db, 'tarjeta', 'id_tarjeta'), id_partido: p.id_partido, ci_jugador: body.ci_jugador, minuto, color: body.color };
  db.tarjeta.push(t);
  recalcularSancionesAutomaticas(db, p.id_torneo, t.ci_jugador);
  return t;
});
ruta('DELETE', '/tarjetas/:id', ({ params }) => {
  const t = db.tarjeta.find((x) => x.id_tarjeta === Number(params.id)) || noEncontrado('La tarjeta');
  const p = partido(t.id_partido);
  puedeEditarPlanilla(p);
  db.tarjeta = db.tarjeta.filter((x) => x !== t);
  recalcularSancionesAutomaticas(db, p.id_torneo, t.ci_jugador);
  return { ok: true };
});

// Sanciones
ruta('GET', '/sanciones', ({ query }) => {
  let lista = db.sancion_jugador;
  if (query.id_torneo) lista = lista.filter((s) => s.id_torneo === Number(query.id_torneo));
  return lista.map((s) => {
    const idEq = equipoDeJugadorEnTorneo(db, s.ci_jugador, s.id_torneo);
    return { ...s, jugador: nombreCompleto(s.ci_jugador), equipo: idEq ? equipo(idEq).nombre : null, automatica: s.motivo !== 'disciplinaria' };
  }).sort((a, b) => b.numero_fecha_inicio - a.numero_fecha_inicio);
});
function validarSancion(b) {
  requerir(b, ['ci_jugador', 'id_torneo', 'numero_fecha_inicio', 'cantidad_fechas']);
  if (!jugador(b.ci_jugador)) noEncontrado('El jugador');
  if (!torneo(b.id_torneo)) noEncontrado('El torneo');
  if (!equipoDeJugadorEnTorneo(db, b.ci_jugador, b.id_torneo)) err(409, 'El jugador no integra ningún plantel en esa edición.');
  const ini = Number(b.numero_fecha_inicio), cant = Number(b.cantidad_fechas);
  if (!Number.isInteger(ini) || ini < 1) err(400, 'La fecha de inicio debe ser un entero ≥ 1.', { numero_fecha_inicio: 'Inválida' });
  if (!Number.isInteger(cant) || cant < 1 || cant > 20) err(400, 'La cantidad de fechas debe estar entre 1 y 20.', { cantidad_fechas: 'Inválida' });
  return { ini, cant };
}
ruta('POST', '/sanciones', ({ body }) => {
  const { ini, cant } = validarSancion(body);
  const s = {
    id_sancion: nextId(db, 'sancion_jugador', 'id_sancion'), ci_jugador: body.ci_jugador, id_torneo: Number(body.id_torneo),
    motivo: 'disciplinaria', numero_fecha_inicio: ini, cantidad_fechas: cant,
  };
  db.sancion_jugador.push(s);
  return s;
}, { soloAdmin: true });
ruta('PUT', '/sanciones/:id', ({ params, body }) => {
  const s = db.sancion_jugador.find((x) => x.id_sancion === Number(params.id)) || noEncontrado('La sanción');
  if (s.motivo !== 'disciplinaria') err(409, 'Las sanciones automáticas se corrigen modificando las tarjetas del partido.');
  const { ini, cant } = validarSancion({ ...body, ci_jugador: s.ci_jugador, id_torneo: s.id_torneo });
  Object.assign(s, { numero_fecha_inicio: ini, cantidad_fechas: cant });
  return s;
}, { soloAdmin: true });
ruta('DELETE', '/sanciones/:id', ({ params }) => {
  const s = db.sancion_jugador.find((x) => x.id_sancion === Number(params.id)) || noEncontrado('La sanción');
  if (s.motivo !== 'disciplinaria') err(409, 'Las sanciones automáticas se eliminan quitando la tarjeta que las originó.');
  db.sancion_jugador = db.sancion_jugador.filter((x) => x !== s);
  return { ok: true };
}, { soloAdmin: true });

// Reportes
ruta('GET', '/reportes/:clave', ({ params, query }) => {
  if (!query.id_torneo) err(400, 'Indicá id_torneo.');
  return calcularReporte(db, params.clave, Number(query.id_torneo)) ?? noEncontrado('El reporte');
});

const PLANILLERO_PUEDE = [/^PUT \/partidos\/\d+\/planilla$/, /^POST \/partidos\/\d+\/(goles|tarjetas)$/, /^DELETE \/(goles|tarjetas)\/\d+$/, /^PATCH \/partidos\/\d+\/estado$/];

export async function mockFetch(metodo, path, { body, query, token } = {}) {
  cargar();
  await new Promise((r) => setTimeout(r, 120));
  const [soloPath] = path.split('?');
  const r = rutas.find((x) => x.metodo === metodo && x.re.test(soloPath));
  if (!r) throw new HttpError(404, `Ruta no encontrada: ${metodo} ${soloPath}`);

  if (soloPath !== '/auth/login') {
    if (!token || !token.startsWith('mock.')) throw new HttpError(401, 'Sesión vencida. Ingresá de nuevo.');
    const rol = token.split('.').pop();
    if (rol === 'planillero' && metodo !== 'GET' && !PLANILLERO_PUEDE.some((re) => re.test(`${metodo} ${soloPath}`))) {
      throw new HttpError(403, 'Tu usuario (planillero) no tiene permiso para esta acción.');
    }
    if (rol === 'planillero' && metodo === 'PATCH' && body?.estado !== 'jugado') {
      throw new HttpError(403, 'El planillero solo puede marcar partidos como jugados.');
    }
  }
  const m = soloPath.match(r.re);
  const params = Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  const respaldo = JSON.stringify(db);
  try {
    const res = r.handler({ params, body: body || {}, query: query || {} });
    if (metodo !== 'GET') guardar();
    return JSON.parse(JSON.stringify(res));
  } catch (e) {
    db = JSON.parse(respaldo); // como un ROLLBACK
    if (e instanceof HttpError) throw e;
    console.error(e);
    throw new HttpError(500, 'Error interno del servidor simulado.');
  }
}

function pick(o, campos) {
  return Object.fromEntries(campos.filter((c) => o[c] !== undefined).map((c) => [c, typeof o[c] === 'string' ? o[c].trim() : o[c]]));
}
