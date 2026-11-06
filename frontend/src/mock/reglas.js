export const HORAS_CORRECCION = 48;

export function nextId(db, tabla, campo) {
  const desdeSeq = db.seq?.[tabla];
  const max = Math.max(0, ...db[tabla].map((x) => x[campo]));
  const id = Math.max(desdeSeq || 0, max + 1);
  if (db.seq) db.seq[tabla] = id + 1;
  return id;
}

export function turnoDe(db, idTurno) {
  return db.turno.find((t) => t.id_turno === Number(idTurno));
}

// Fecha/hora de inicio y fin de un partido como Date local
export function horarioPartido(db, p) {
  const t = turnoDe(db, p.id_turno);
  if (!t || !p.dia) return { inicio: null, fin: null };
  return {
    inicio: new Date(`${p.dia}T${t.hora_inicio}:00`),
    fin: new Date(`${p.dia}T${t.hora_fin}:00`),
  };
}

export function yaSeJugoElHorario(db, p, ahora = new Date()) {
  const { fin } = horarioPartido(db, p);
  return fin !== null && ahora >= fin;
}

export function dentroDeVentanaCorreccion(db, p, ahora = new Date()) {
  const { fin } = horarioPartido(db, p);
  if (!fin) return false;
  return ahora.getTime() <= fin.getTime() + HORAS_CORRECCION * 3600 * 1000;
}

export function sancionesQueCubren(db, ci, idTorneo, fecha) {
  return db.sancion_jugador.filter((s) => s.ci_jugador === ci && s.id_torneo === Number(idTorneo)
    && fecha >= s.numero_fecha_inicio && fecha < s.numero_fecha_inicio + s.cantidad_fechas);
}

export function estaSuspendido(db, ci, idTorneo, fecha) {
  return sancionesQueCubren(db, ci, idTorneo, fecha).length > 0;
}

export function plantelDe(db, idEquipo) {
  return db.equipo_jugador_torneo.filter((p) => p.id_equipo === Number(idEquipo));
}

export function equipoDeJugadorEnTorneo(db, ci, idTorneo) {
  const fila = db.equipo_jugador_torneo.find((p) => p.ci_jugador === ci && p.id_torneo === Number(idTorneo));
  return fila ? fila.id_equipo : null;
}

// Goles a favor de cada equipo en un partido (los autogoles suman al rival)
export function resultado(db, p) {
  const goles = db.gol.filter((g) => g.id_partido === p.id_partido);
  let local = 0, visitante = 0;
  for (const g of goles) {
    const fila = db.planilla_partido.find((x) => x.id_partido === p.id_partido && x.ci_jugador === g.ci_jugador);
    const eqJugador = fila ? fila.id_equipo : null;
    const paraLocal = g.autogol ? eqJugador === p.id_equipo_visitante : eqJugador === p.id_equipo_local;
    if (paraLocal) local++; else visitante++;
  }
  return { goles_local: local, goles_visitante: visitante };
}

// Roja = 1 fecha; cada 3 amarillas = 1 fecha. Se cumplen en la fecha siguiente.
export function recalcularSancionesAutomaticas(db, idTorneo, ci = null) {
  idTorneo = Number(idTorneo);
  db.sancion_jugador = db.sancion_jugador.filter((s) => !(s.id_torneo === idTorneo && s.motivo !== 'disciplinaria'
    && (ci === null || s.ci_jugador === ci)));

  const partidos = new Map(db.partido.filter((p) => p.id_torneo === idTorneo).map((p) => [p.id_partido, p]));
  const tarjetas = db.tarjeta
    .filter((t) => partidos.has(t.id_partido) && (ci === null || t.ci_jugador === ci))
    .map((t) => ({ ...t, fecha: partidos.get(t.id_partido).numero_fecha }))
    .sort((a, b) => a.fecha - b.fecha || a.minuto - b.minuto || a.id_tarjeta - b.id_tarjeta);

  const amarillas = {};
  for (const t of tarjetas) {
    let motivo = null;
    if (t.color === 'roja') motivo = 'roja';
    else {
      amarillas[t.ci_jugador] = (amarillas[t.ci_jugador] || 0) + 1;
      if (amarillas[t.ci_jugador] % 3 === 0) motivo = 'acumulacion de amarillas';
    }
    if (motivo) {
      db.sancion_jugador.push({
        id_sancion: nextId(db, 'sancion_jugador', 'id_sancion'),
        ci_jugador: t.ci_jugador, id_torneo: idTorneo, motivo,
        numero_fecha_inicio: t.fecha + 1, cantidad_fechas: 1,
        id_tarjeta_origen: t.id_tarjeta,
      });
    }
  }
}
