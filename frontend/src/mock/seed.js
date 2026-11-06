import { recalcularSancionesAutomaticas } from './reglas.js';
import { FACULTADES, EQUIPOS, COMPLEJOS, CANCHAS, JUGADORES, PLANTELES } from './datos_base.js';

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fecha local (YYYY-MM-DD) desplazada `offset` días desde hoy
function diaRel(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function crearSeed() {
  const r = rng(2026);
  const db = {
    login: [
      { correo: 'admin@ucu.edu.uy', contrasena: 'admin123', rol: 'administrador' },
      { correo: 'planillero@ucu.edu.uy', contrasena: 'plan123', rol: 'planillero' },
    ],
    facultad: FACULTADES.map((f) => ({ ...f })),
    torneo: [
      { id_torneo: 1, nombre: 'Torneo Interfacultades de Fútbol 5 - Segundo Semestre 2026', anio: 2026, semestre: 2, fecha_inicio: diaRel(-20), fecha_fin: diaRel(40), estado: 'en curso' },
      { id_torneo: 2, nombre: 'Torneo Interfacultades de Fútbol 5 - Primer Semestre 2027', anio: 2027, semestre: 1, fecha_inicio: '2027-03-15', fecha_fin: '2027-06-30', estado: 'inscripcion' },
    ],
    turno: [
      { id_turno: 1, hora_inicio: '18:00', hora_fin: '19:00' },
      { id_turno: 2, hora_inicio: '19:00', hora_fin: '20:00' },
      { id_turno: 3, hora_inicio: '20:00', hora_fin: '21:00' },
      { id_turno: 4, hora_inicio: '21:00', hora_fin: '22:00' },
      { id_turno: 5, hora_inicio: '22:00', hora_fin: '23:00' },
    ],
    complejo: COMPLEJOS.map((c) => ({ ...c })),
    cancha: CANCHAS.map((c) => ({ ...c })),
    jugador: JUGADORES.map((j) => ({ ...j })),
    equipo: EQUIPOS.map((e) => ({ ...e, id_torneo: 1 })),
    equipo_jugador_torneo: PLANTELES.map((p) => ({ ...p, id_torneo: 1 })),
    partido: [],
    planilla_partido: [],
    gol: [],
    tarjeta: [],
    sancion_jugador: [],
    seq: {},
  };

  // Edición 2027 en inscripción
  const fac = (id) => db.jugador.filter((j) => j.id_facultad === id);
  db.equipo.push({ id_equipo: 7, nombre: 'Ingenieria FC', id_torneo: 2, id_facultad: 1, ci_capitan: fac(1)[1].ci });
  fac(1).slice(1, 5).forEach((j, n) => db.equipo_jugador_torneo.push({ id_equipo: 7, ci_jugador: j.ci, id_torneo: 2, numero_camiseta: n + 1 }));
  db.equipo.push({ id_equipo: 8, nombre: 'Derecho United', id_torneo: 2, id_facultad: 2, ci_capitan: null });
  fac(2).slice(0, 2).forEach((j, n) => db.equipo_jugador_torneo.push({ id_equipo: 8, ci_jugador: j.ci, id_torneo: 2, numero_camiseta: n + 7 }));

  // Fixture todos contra todos (método del círculo)
  const ids = [1, 2, 3, 4, 5, 6];
  const arr = [...ids];
  const rondas = [];
  for (let ronda = 0; ronda < ids.length - 1; ronda++) {
    const pares = [];
    for (let k = 0; k < ids.length / 2; k++) {
      const a = arr[k], b = arr[ids.length - 1 - k];
      pares.push(ronda % 2 ? [b, a] : [a, b]);
    }
    rondas.push(pares);
    arr.splice(1, 0, arr.pop());
  }
  // Fechas relativas a hoy
  const dias = [diaRel(-15), diaRel(-8), diaRel(-1), diaRel(6), diaRel(13)];
  const slots = [
    { nombre_cancha: 'Cancha 1', id_complejo: 1, id_turno: 2 },
    { nombre_cancha: 'Cancha 2', id_complejo: 1, id_turno: 2 },
    { nombre_cancha: 'Cancha 1', id_complejo: 2, id_turno: 3 },
  ];
  let idPartido = 1;
  rondas.forEach((pares, f) => {
    pares.forEach(([local, visitante], k) => {
      let estado = f < 3 ? 'jugado' : 'programado';
      if (f === 3 && k === 0) estado = 'postergado';
      if (f === 3 && k === 1) estado = 'cancelado';
      db.partido.push({
        id_partido: idPartido++, id_torneo: 1, numero_fecha: f + 1,
        id_equipo_local: local, id_equipo_visitante: visitante,
        dia: dias[f], ...slots[k], estado,
      });
    });
  });

  // Planillas, goles y tarjetas de las fechas jugadas
  const plantel = (idEq) => db.equipo_jugador_torneo.filter((p) => p.id_equipo === idEq).map((p) => p.ci_jugador);
  const nuncaJuega = new Set([1, 3, 5].map((e) => plantel(e)[6]));
  const forzados = {
    roja: { fecha: 2, equipo: 2, idx: 2 },   // roja en fecha 2 -> suspendido fecha 3
    amarillas: { equipo: 4, idx: 1 },        // amarilla en fechas 1,2,3 -> suspendido fecha 4
  };
  let idGol = 1, idTarjeta = 1;

  for (let f = 1; f <= 3; f++) {
    recalcularSancionesAutomaticas(db, 1);
    const partidos = db.partido.filter((p) => p.numero_fecha === f);
    for (const p of partidos) {
      const enPlanilla = {};
      for (const eq of [p.id_equipo_local, p.id_equipo_visitante]) {
        enPlanilla[eq] = plantel(eq).filter((ci) => !nuncaJuega.has(ci) && !estaSuspendidoSeed(db, ci, 1, f));
        enPlanilla[eq].forEach((ci) => db.planilla_partido.push({ id_partido: p.id_partido, ci_jugador: ci, id_equipo: eq }));
      }
      for (const eq of [p.id_equipo_local, p.id_equipo_visitante]) {
        const rival = eq === p.id_equipo_local ? p.id_equipo_visitante : p.id_equipo_local;
        const cant = Math.floor(r() * 5);
        for (let g = 0; g < cant; g++) {
          const autogol = r() < 0.08;
          const lista = autogol ? enPlanilla[rival] : enPlanilla[eq];
          db.gol.push({ id_gol: idGol++, id_partido: p.id_partido, ci_jugador: lista[Math.floor(r() * lista.length)], minuto: 1 + Math.floor(r() * 49), autogol });
        }
        const amarillas = Math.floor(r() * 2);
        for (let t = 0; t < amarillas; t++) {
          const lista = enPlanilla[eq].filter((ci) => ci !== plantel(forzados.amarillas.equipo)[forzados.amarillas.idx]);
          db.tarjeta.push({ id_tarjeta: idTarjeta++, id_partido: p.id_partido, ci_jugador: lista[Math.floor(r() * lista.length)], minuto: 1 + Math.floor(r() * 49), color: 'amarilla' });
        }
      }
      const ciAmarillas = plantel(forzados.amarillas.equipo)[forzados.amarillas.idx];
      if (enPlanilla[forzados.amarillas.equipo]?.includes(ciAmarillas)) {
        db.tarjeta.push({ id_tarjeta: idTarjeta++, id_partido: p.id_partido, ci_jugador: ciAmarillas, minuto: 12 + f * 5, color: 'amarilla' });
      }
      const ciRoja = plantel(forzados.roja.equipo)[forzados.roja.idx];
      if (f === forzados.roja.fecha && enPlanilla[forzados.roja.equipo]?.includes(ciRoja)) {
        db.tarjeta.push({ id_tarjeta: idTarjeta++, id_partido: p.id_partido, ci_jugador: ciRoja, minuto: 38, color: 'roja' });
      }
    }
  }
  recalcularSancionesAutomaticas(db, 1);

  // Sanción disciplinaria de la organización
  const ciDisc = plantel(6)[3];
  db.sancion_jugador.push({
    id_sancion: Math.max(0, ...db.sancion_jugador.map((s) => s.id_sancion)) + 1,
    ci_jugador: ciDisc, id_torneo: 1, motivo: 'disciplinaria',
    numero_fecha_inicio: 4, cantidad_fechas: 2, id_tarjeta_origen: null,
  });

  db.seq = {
    torneo: 3, equipo: 9, complejo: 4, partido: idPartido, gol: idGol, tarjeta: idTarjeta,
    sancion_jugador: Math.max(...db.sancion_jugador.map((s) => s.id_sancion)) + 1,
  };
  return db;
}

function estaSuspendidoSeed(db, ci, idTorneo, fecha) {
  return db.sancion_jugador.some((s) => s.ci_jugador === ci && s.id_torneo === idTorneo
    && fecha >= s.numero_fecha_inicio && fecha < s.numero_fecha_inicio + s.cantidad_fechas);
}
