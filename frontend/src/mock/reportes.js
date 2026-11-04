import { resultado, equipoDeJugadorEnTorneo } from './reglas.js';

export function calcularReporte(db, clave, idTorneo) {
  const equipos = db.equipo.filter((e) => e.id_torneo === idTorneo);
  const nombreEq = (id) => db.equipo.find((e) => e.id_equipo === id)?.nombre;
  const partidos = db.partido.filter((p) => p.id_torneo === idTorneo);
  const jugados = partidos.filter((p) => p.estado === 'jugado');
  const idsJugados = new Set(jugados.map((p) => p.id_partido));
  const jug = (ci) => db.jugador.find((j) => j.ci === ci);

  switch (clave) {
    case 'posiciones': {
      const filas = new Map(equipos.map((e) => [e.id_equipo, { equipo: e.nombre, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 }]));
      for (const p of jugados) {
        const { goles_local: gl, goles_visitante: gv } = resultado(db, p);
        const L = filas.get(p.id_equipo_local), V = filas.get(p.id_equipo_visitante);
        if (!L || !V) continue;
        L.pj++; V.pj++; L.gf += gl; L.gc += gv; V.gf += gv; V.gc += gl;
        if (gl > gv) { L.pg++; V.pp++; L.pts += 3; }
        else if (gl < gv) { V.pg++; L.pp++; V.pts += 3; }
        else { L.pe++; V.pe++; L.pts++; V.pts++; }
      }
      const lista = [...filas.values()].map((f) => ({ ...f, dg: f.gf - f.gc }));
      lista.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.equipo.localeCompare(b.equipo));
      return lista.map((f, i) => ({ pos: i + 1, ...f }));
    }
    case 'goleadores': {
      const cuenta = {};
      for (const g of db.gol) if (idsJugados.has(g.id_partido) && !g.autogol) cuenta[g.ci_jugador] = (cuenta[g.ci_jugador] || 0) + 1;
      return Object.entries(cuenta)
        .map(([ci, goles]) => ({ jugador: `${jug(ci)?.nombre} ${jug(ci)?.apellido}`, equipo: nombreEq(equipoDeJugadorEnTorneo(db, ci, idTorneo)), goles }))
        .sort((a, b) => b.goles - a.goles || a.jugador.localeCompare(b.jugador))
        .slice(0, 10).map((f, i) => ({ pos: i + 1, ...f }));
    }
    case 'fair-play': {
      const filas = new Map(equipos.map((e) => [e.id_equipo, { equipo: e.nombre, amarillas: 0, rojas: 0, puntaje: 0 }]));
      for (const t of db.tarjeta) {
        if (!partidos.some((p) => p.id_partido === t.id_partido)) continue;
        const fila = db.planilla_partido.find((x) => x.id_partido === t.id_partido && x.ci_jugador === t.ci_jugador);
        const f = fila && filas.get(fila.id_equipo);
        if (!f) continue;
        if (t.color === 'roja') { f.rojas++; f.puntaje += 3; } else { f.amarillas++; f.puntaje += 1; }
      }
      return [...filas.values()].sort((a, b) => a.puntaje - b.puntaje || a.equipo.localeCompare(b.equipo)).map((f, i) => ({ pos: i + 1, ...f }));
    }
    case 'promedio-goles': {
      const porFecha = {};
      let total = 0;
      for (const p of jugados) {
        const { goles_local, goles_visitante } = resultado(db, p);
        const g = goles_local + goles_visitante;
        porFecha[p.numero_fecha] ??= { partidos: 0, goles: 0 };
        porFecha[p.numero_fecha].partidos++; porFecha[p.numero_fecha].goles += g; total += g;
      }
      const filas = Object.entries(porFecha).map(([f, v]) => ({ fecha: `Fecha ${f}`, partidos: v.partidos, goles: v.goles, promedio: +(v.goles / v.partidos).toFixed(2) }));
      filas.push({ fecha: 'Toda la edición', partidos: jugados.length, goles: total, promedio: jugados.length ? +(total / jugados.length).toFixed(2) : 0, total: true });
      return filas;
    }
    case 'uso-canchas': {
      const activos = partidos.filter((p) => p.estado !== 'cancelado');
      const canchas = {}, turnos = {};
      for (const p of activos) {
        const cx = db.complejo.find((c) => c.id_complejo === p.id_complejo)?.nombre;
        const k = `${p.nombre_cancha} — ${cx}`;
        canchas[k] = (canchas[k] || 0) + 1;
        const t = db.turno.find((x) => x.id_turno === p.id_turno);
        const kt = `${t.hora_inicio} a ${t.hora_fin}`;
        turnos[kt] = (turnos[kt] || 0) + 1;
      }
      return {
        canchas: Object.entries(canchas).map(([cancha, partidos]) => ({ cancha, partidos })).sort((a, b) => b.partidos - a.partidos),
        turnos: Object.entries(turnos).map(([turno, partidos]) => ({ turno, partidos })).sort((a, b) => b.partidos - a.partidos),
      };
    }
    case 'jugadores-facultad-tipo': {
      const inscriptos = new Set(db.equipo_jugador_torneo.filter((p) => p.id_torneo === idTorneo).map((p) => p.ci_jugador));
      return db.facultad.map((f) => {
        const js = db.jugador.filter((j) => j.id_facultad === f.id_facultad && inscriptos.has(j.ci));
        const c = (t) => js.filter((j) => j.tipo === t).length;
        return { facultad: f.nombre, grado: c('grado'), posgrado: c('posgrado'), docente: c('docente'), funcionario: c('funcionario'), total: js.length };
      });
    }
    case 'nunca-jugaron': {
      const enPlanilla = new Set(db.planilla_partido.filter((x) => partidos.some((p) => p.id_partido === x.id_partido)).map((x) => x.ci_jugador));
      return db.equipo_jugador_torneo.filter((p) => p.id_torneo === idTorneo && !enPlanilla.has(p.ci_jugador)).map((p) => ({
        ci: p.ci_jugador, jugador: `${jug(p.ci_jugador)?.nombre} ${jug(p.ci_jugador)?.apellido}`, equipo: nombreEq(p.id_equipo), camiseta: p.numero_camiseta,
      }));
    }
    case 'sanciones-equipo': {
      const filas = new Map(equipos.map((e) => [e.id_equipo, { equipo: e.nombre, roja: 0, acumulacion: 0, disciplinaria: 0, total: 0 }]));
      for (const s of db.sancion_jugador.filter((x) => x.id_torneo === idTorneo)) {
        const f = filas.get(equipoDeJugadorEnTorneo(db, s.ci_jugador, idTorneo));
        if (!f) continue;
        if (s.motivo === 'roja') f.roja++; else if (s.motivo === 'disciplinaria') f.disciplinaria++; else f.acumulacion++;
        f.total++;
      }
      return [...filas.values()].sort((a, b) => b.total - a.total);
    }
    case 'estado-partidos': {
      const total = partidos.length || 1;
      return ['jugado', 'programado', 'postergado', 'cancelado'].map((estado) => {
        const n = partidos.filter((p) => p.estado === estado).length;
        return { estado, partidos: n, porcentaje: +((n * 100) / total).toFixed(1) };
      });
    }
    case 'valla-menos-vencida': {
      const tabla = calcularReporte(db, 'posiciones', idTorneo);
      return tabla.filter((f) => f.pj > 0).map((f) => ({ equipo: f.equipo, pj: f.pj, gc: f.gc, promedio_gc: +(f.gc / f.pj).toFixed(2) }))
        .sort((a, b) => a.promedio_gc - b.promedio_gc || a.gc - b.gc);
    }
    case 'goles-por-tramo': {
      const tramos = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60'].map((t) => ({ tramo: `${t}'`, goles: 0 }));
      for (const g of db.gol) if (idsJugados.has(g.id_partido)) tramos[Math.min(5, Math.max(0, Math.ceil(g.minuto / 10) - 1))].goles++;
      return tramos;
    }
    case 'jugadores-tarjetas': {
      const c = {};
      for (const t of db.tarjeta) {
        if (!partidos.some((p) => p.id_partido === t.id_partido)) continue;
        c[t.ci_jugador] ??= { amarillas: 0, rojas: 0 };
        c[t.ci_jugador][t.color === 'roja' ? 'rojas' : 'amarillas']++;
      }
      return Object.entries(c).map(([ci, v]) => ({
        jugador: `${jug(ci)?.nombre} ${jug(ci)?.apellido}`, equipo: nombreEq(equipoDeJugadorEnTorneo(db, ci, idTorneo)), ...v, puntos: v.amarillas + v.rojas * 3,
      })).sort((a, b) => b.puntos - a.puntos).slice(0, 10);
    }
    case 'racha-invicta': {
      const tabla = calcularReporte(db, 'posiciones', idTorneo);
      return tabla.map((f) => ({ equipo: f.equipo, partidos_sin_perder: f.pg + f.pe }))
        .sort((a, b) => b.partidos_sin_perder - a.partidos_sin_perder).map((f, i) => ({ pos: i + 1, ...f }));
    }
    case 'fecha-mas-goles': {
      const porFecha = {};
      for (const p of jugados) {
        const { goles_local, goles_visitante } = resultado(db, p);
        porFecha[p.numero_fecha] = (porFecha[p.numero_fecha] || 0) + goles_local + goles_visitante;
      }
      return Object.entries(porFecha).map(([f, goles]) => ({ fecha: `Fecha ${f}`, goles })).sort((a, b) => b.goles - a.goles);
    }
    case 'equipos-sin-sanciones': {
      const conSancion = new Set(db.sancion_jugador.filter((s) => s.id_torneo === idTorneo).map((s) => equipoDeJugadorEnTorneo(db, s.ci_jugador, idTorneo)));
      return equipos.filter((e) => !conSancion.has(e.id_equipo)).map((e) => ({ equipo: e.nombre }));
    }
    default: return null;
  }
}
