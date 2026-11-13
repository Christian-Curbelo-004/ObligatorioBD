// Turnos fijos de 18 a 23 h (id 1 a 5)
const TURNOS = [18, 19, 20, 21, 22].map((h, i) => ({ id_turno: i + 1, hora_inicio: `${h}:00`, hora_fin: `${h + 1}:00` }));
const HORAS_CORRECCION = 48;

// Acciones que no ofrece la API
export const CAPACIDADES_BACKEND = {
  borrarEventos: true,
  corregirPlanilla: false,   // la lista de jugadores se carga una sola vez
  marcarJugadoManual: false, // el partido pasa a "jugado" al guardar la planilla
};

// Flask serializa DATE como "Mon, 21 Sep 2026 00:00:00 GMT"
export const fecha = (v) => {
  if (!v) return v;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return String(v).slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
};
const hora = (v) => (v == null ? v : String(v).padStart(8, '0').slice(0, 5));
const num = (v) => (v === null || v === undefined || v === '' ? v : Number(v));
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const estadoTorneo = (e) => (e === 'en_curso' ? 'en curso' : e);
const motivo = (m) => (m === 'acumulacion_amarillas' ? 'acumulacion de amarillas' : m);
const pick = (o, claves) => Object.fromEntries(claves.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const nombreDe = (j) => (j ? `${j.nombre} ${j.apellido}` : '');

const turno = (id) => TURNOS.find((t) => t.id_turno === Number(id));
function finDelPartido(p) {
  const t = turno(p.id_turno);
  return t && p.dia ? new Date(`${p.dia}T${t.hora_fin}:00`) : null;
}

export function crearApiBackend(http, ApiError) {
  const get = (path, query) => http('GET', path, { query });
  const noDisponible = (msg) => () => Promise.reject(new ApiError(501, msg));

  const torneosRaw = async () => (await get('/torneos/')).map((t) => ({
    ...t, estado: estadoTorneo(t.estado), fecha_inicio: fecha(t.fecha_inicio), fecha_fin: fecha(t.fecha_fin),
  }));
  const equiposRaw = async (idTorneo) => (await get('/equipos/'))
    .filter((e) => !idTorneo || e.id_torneo === Number(idTorneo));
  const plantelRaw = async (idEquipo) => (await get(`/equipos/${idEquipo}/plantel`))
    .map((p) => ({ ...p, numero_camiseta: num(p.numero_camiseta) }));
  const complejosRaw = () => get('/complejos/');
  const normPartido = (p) => ({
    id_partido: p.id_partido, id_torneo: p.id_torneo, numero_fecha: num(p.numero_fecha),
    id_equipo_local: p.id_equipo_local, id_equipo_visitante: p.id_equipo_visitante,
    dia: fecha(p.dia), id_turno: num(p.id_turno), nombre_cancha: p.nombre_cancha,
    id_complejo: p.id_complejo, estado: p.estado,
  });
  const partidosRaw = async (idTorneo) => (await get('/partidos/', idTorneo ? { id_torneo: idTorneo } : undefined)).map(normPartido);
  const sancionesRaw = async (idTorneo) => (await get('/sanciones/', idTorneo ? { id_torneo: idTorneo } : undefined)).map((s) => ({
    ...s, motivo: motivo(s.motivo), numero_fecha_inicio: num(s.numero_fecha_inicio), cantidad_fechas: num(s.cantidad_fechas),
  }));
  const planillaRaw = async (idPartido) => {
    const r = await get(`/partidos/${idPartido}/planilla`);
    return {
      jugadores: r.jugadores || [],
      goles: (r.goles || []).map((g) => ({ ...g, autogol: bool(g.autogol), minuto: num(g.minuto) })),
      tarjetas: (r.tarjetas || []).map((t) => ({ ...t, minuto: num(t.minuto) })),
    };
  };

  const sancionesQueCubren = (sanciones, ci, numeroFecha) => sanciones.filter((s) => s.ci_jugador === ci
    && numeroFecha >= s.numero_fecha_inicio && numeroFecha < s.numero_fecha_inicio + s.cantidad_fechas);

  // ci -> { id_equipo, equipo, numero_camiseta } para una edición
  async function mapaJugadorEquipo(idTorneo) {
    const equipos = await equiposRaw(idTorneo);
    const planteles = await Promise.all(equipos.map((e) => plantelRaw(e.id_equipo)));
    const mapa = new Map();
    equipos.forEach((e, i) => planteles[i].forEach((p) => mapa.set(p.ci_jugador, { id_equipo: e.id_equipo, equipo: e.nombre, numero_camiseta: p.numero_camiseta })));
    return mapa;
  }

  // Resultado calculado desde los goles (un autogol suma al rival)
  function resultado(p, planilla) {
    const equipoDe = (ci) => planilla.jugadores.find((j) => j.ci_jugador === ci)?.id_equipo;
    let local = 0, visitante = 0;
    for (const g of planilla.goles) {
      const eq = equipoDe(g.ci_jugador);
      const paraLocal = g.autogol ? eq === p.id_equipo_visitante : eq === p.id_equipo_local;
      if (paraLocal) local++; else visitante++;
    }
    return { goles_local: local, goles_visitante: visitante };
  }

  function expandirPartido(p, equipos, complejos, planilla) {
    const t = turno(p.id_turno);
    const fin = finDelPartido(p);
    return {
      ...p,
      equipo_local: equipos.find((e) => e.id_equipo === p.id_equipo_local)?.nombre,
      equipo_visitante: equipos.find((e) => e.id_equipo === p.id_equipo_visitante)?.nombre,
      hora_inicio: t?.hora_inicio, hora_fin: t?.hora_fin,
      complejo: complejos.find((c) => c.id_complejo === p.id_complejo)?.nombre,
      ...(p.estado === 'jugado' && planilla ? resultado(p, planilla) : { goles_local: null, goles_visitante: null }),
      horario_cumplido: fin ? new Date() >= fin : false,
      corregible_hasta: fin ? new Date(fin.getTime() + HORAS_CORRECCION * 3600e3).toISOString() : null,
    };
  }

  async function partidosExpandidos(idTorneo) {
    const [partidos, equipos, complejos] = await Promise.all([partidosRaw(idTorneo), equiposRaw(), complejosRaw()]);
    const planillas = await Promise.all(partidos.map((p) => (p.estado === 'jugado' ? planillaRaw(p.id_partido) : null)));
    return partidos.map((p, i) => expandirPartido(p, equipos, complejos, planillas[i]));
  }

  async function equiposExpandidos(idTorneo) {
    const equipos = await equiposRaw(idTorneo);
    const planteles = await Promise.all(equipos.map((e) => plantelRaw(e.id_equipo)));
    return equipos.map((e, i) => {
      const cap = planteles[i].find((p) => p.ci_jugador === e.ci_capitan);
      return {
        ...e, facultad: e.nombre_facultad, torneo: e.nombre_torneo,
        capitan: cap ? nombreDe(cap) : null, cantidad_jugadores: planteles[i].length,
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  const conPosicion = (filas) => filas.map((f, i) => ({ pos: i + 1, ...f }));

  async function reporte(clave, idTorneo) {
    const r = (ruta) => get(`/reportes/${ruta}`);
    switch (clave) {
      case 'posiciones': {
        const [filas, equipos] = await Promise.all([r(`posiciones/${idTorneo}`), equiposRaw(idTorneo)]);
        const lista = filas.map((f) => ({
          equipo: f.equipo, pj: num(f.PJ), pg: num(f.PG), pe: num(f.PE), pp: num(f.PP),
          gf: num(f.GF), gc: num(f.GC), dg: num(f.DG), pts: num(f.puntos),
        }));
        // Equipos sin partidos con goles: se agregan en cero
        for (const e of equipos) if (!lista.some((f) => f.equipo === e.nombre)) lista.push({ equipo: e.nombre, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 });
        return conPosicion(lista);
      }
      case 'goleadores': {
        const [filas, mapa] = await Promise.all([r(`goleadores/${idTorneo}`), mapaJugadorEquipo(idTorneo)]);
        return conPosicion(filas.map((f) => ({ jugador: nombreDe(f), equipo: mapa.get(f.ci)?.equipo, goles: num(f.goles) })));
      }
      case 'fair-play':
        return conPosicion((await r(`fairplay/${idTorneo}`)).map((f) => ({ equipo: f.equipo, puntaje: num(f.puntaje_fairplay) ?? 0 })));
      case 'promedio-goles': {
        const d = await r(`promedio-goles/${idTorneo}`);
        const filas = d.por_fecha.map((f) => ({ fecha: `Fecha ${f.numero_fecha}`, partidos: num(f.partidos), goles: num(f.goles), promedio: num(f.promedio) }));
        filas.push({ fecha: 'Toda la edición', partidos: num(d.total?.partidos) || 0, goles: num(d.total?.goles) || 0, promedio: num(d.total?.promedio) || 0, total: true });
        return filas;
      }
      case 'uso-canchas': {
        const d = await r(`canchas-turnos/${idTorneo}`);
        return {
          canchas: d.canchas.map((c) => ({ cancha: `${c.nombre_cancha} — ${c.nombre_complejo}`, partidos: num(c.partidos) })),
          turnos: d.turnos.map((t) => ({ turno: `${hora(t.hora_inicio)} a ${hora(t.hora_fin)}`, partidos: num(t.partidos) })),
        };
      }
      case 'jugadores-facultad-tipo': {
        const filas = await r('jugadores-por-facultad');
        const por = new Map();
        for (const f of filas) {
          const x = por.get(f.facultad) || { facultad: f.facultad, grado: 0, posgrado: 0, docente: 0, funcionario: 0, total: 0 };
          x[f.tipo] = num(f.cantidad); x.total += num(f.cantidad);
          por.set(f.facultad, x);
        }
        return [...por.values()];
      }
      case 'nunca-jugaron': {
        const [filas, mapa] = await Promise.all([r(`jugadores-sin-planilla/${idTorneo}`), mapaJugadorEquipo(idTorneo)]);
        return filas.map((f) => ({ ci: f.ci, jugador: nombreDe(f), equipo: f.equipo, camiseta: mapa.get(f.ci)?.numero_camiseta }));
      }
      case 'sanciones-equipo': {
        const filas = await r(`sanciones-por-equipo/${idTorneo}`);
        const por = new Map();
        for (const f of filas) {
          const x = por.get(f.equipo) || { equipo: f.equipo, roja: 0, acumulacion: 0, disciplinaria: 0, total: 0 };
          const m = motivo(f.motivo);
          const k = m === 'roja' ? 'roja' : m === 'disciplinaria' ? 'disciplinaria' : 'acumulacion';
          x[k] += num(f.cantidad); x.total += num(f.cantidad);
          por.set(f.equipo, x);
        }
        return [...por.values()].sort((a, b) => b.total - a.total);
      }
      case 'estado-partidos': {
        const d = await r(`porcentaje-partidos/${idTorneo}`);
        const total = num(d.total) || 0, jugados = num(d.jugados) || 0, noJugados = num(d.no_jugados) || 0;
        const pct = (n) => (total ? +((n * 100) / total).toFixed(1) : 0);
        return [
          { estado: 'jugado', partidos: jugados, porcentaje: pct(jugados) },
          { estado: 'postergado o cancelado', partidos: noJugados, porcentaje: pct(noJugados) },
          { estado: 'programado', partidos: total - jugados - noJugados, porcentaje: pct(total - jugados - noJugados) },
        ];
      }
      case 'racha-invicta':
        return conPosicion((await r(`racha-invicta/${idTorneo}`)).map((f) => ({ equipo: f.equipo, partidos_sin_perder: num(f.partidos_sin_perder) })));
      case 'fecha-mas-goles':
        return (await r(`fecha-mas-goles/${idTorneo}`)).map((f) => ({ fecha: `Fecha ${f.numero_fecha}`, goles: num(f.total_goles) }));
      case 'equipos-sin-sanciones':
        return (await r(`equipos-sin-sanciones/${idTorneo}`)).map((f) => ({ equipo: f.equipo }));
      default:
        throw new ApiError(404, 'Reporte no disponible.');
    }
  }

  return {
    async login(correo, contrasena) {
      const r = await http('POST', '/auth/login', { body: { correo, password: contrasena } });
      return { token: r.token, rol: r.rol, correo };
    },
    facultades: () => get('/facultades/'),
    turnos: async () => TURNOS,

    torneos: {
      listar: async () => (await torneosRaw()).sort((a, b) => b.anio - a.anio || b.semestre - a.semestre),
      obtener: async (id) => (await torneosRaw()).find((t) => t.id_torneo === Number(id)),
      crear: (b) => http('POST', '/torneos/', { body: pick(b, ['nombre', 'anio', 'semestre', 'fecha_inicio', 'fecha_fin', 'estado']) }),
      async modificar(id, b) {
        const actual = (await torneosRaw()).find((t) => t.id_torneo === Number(id));
        const body = pick(b, ['nombre', 'anio', 'semestre', 'fecha_inicio', 'fecha_fin']);
        // El estado se manda solo si cambió
        if (b.estado && b.estado !== actual?.estado) body.estado = b.estado;
        return http('PUT', `/torneos/${id}`, { body });
      },
      eliminar: (id) => http('DELETE', `/torneos/${id}`),
    },

    jugadores: {
      async listar(filtros = {}) {
        let lista = (await get('/jugadores/')).map((j) => ({ ...j, facultad: j.nombre_facultad, fecha_nacimiento: fecha(j.fecha_nacimiento) }));
        if (filtros.id_facultad) lista = lista.filter((j) => j.id_facultad === Number(filtros.id_facultad));
        if (filtros.tipo) lista = lista.filter((j) => j.tipo === filtros.tipo);
        if (filtros.q) {
          const q = filtros.q.toLowerCase();
          lista = lista.filter((j) => `${j.nombre} ${j.apellido} ${j.ci} ${j.email}`.toLowerCase().includes(q));
        }
        return lista.sort((a, b) => a.apellido.localeCompare(b.apellido));
      },
      crear: (b) => http('POST', '/jugadores/', { body: { ...pick(b, ['ci', 'nombre', 'apellido', 'email', 'fecha_nacimiento', 'tipo']), id_facultad: Number(b.id_facultad) } }),
      modificar: (ci, b) => http('PUT', `/jugadores/${encodeURIComponent(ci)}`, { body: { ...pick(b, ['nombre', 'apellido', 'email', 'fecha_nacimiento', 'tipo']), id_facultad: Number(b.id_facultad) } }),
      eliminar: (ci) => http('DELETE', `/jugadores/${encodeURIComponent(ci)}`),
    },

    equipos: {
      listar: (q = {}) => equiposExpandidos(q.id_torneo),
      obtener: async (id) => {
        const e = await get(`/equipos/${id}`);
        return (await equiposExpandidos(e.id_torneo)).find((x) => x.id_equipo === Number(id));
      },
      crear: (b) => http('POST', '/equipos/', { body: { nombre: b.nombre, id_torneo: Number(b.id_torneo), id_facultad: Number(b.id_facultad) } }),
      modificar: (id, b) => http('PUT', `/equipos/${id}`, { body: { ...pick(b, ['nombre']), ...(b.id_facultad ? { id_facultad: Number(b.id_facultad) } : {}), ci_capitan: b.ci_capitan || null } }),
      eliminar: (id) => http('DELETE', `/equipos/${id}`),
    },

    plantel: {
      async listar(idEquipo) {
        const equipo = await get(`/equipos/${idEquipo}`);
        const [plantel, partidos, sanciones] = await Promise.all([plantelRaw(idEquipo), partidosRaw(equipo.id_torneo), sancionesRaw(equipo.id_torneo)]);
        const proximaFecha = Math.max(0, ...partidos.filter((p) => p.estado === 'jugado').map((p) => p.numero_fecha)) + 1;
        return plantel.map((p) => ({
          ...p, es_capitan: equipo.ci_capitan === p.ci_jugador,
          suspendido_proxima_fecha: sancionesQueCubren(sanciones, p.ci_jugador, proximaFecha).length > 0,
        })).sort((a, b) => a.numero_camiseta - b.numero_camiseta);
      },
      agregar: (idEquipo, b) => http('POST', `/equipos/${idEquipo}/plantel`, { body: { ci_jugador: b.ci_jugador, numero_camiseta: Number(b.numero_camiseta) } }),
      modificar: noDisponible('El backend no permite cambiar el número de camiseta: quitá al jugador y volvé a agregarlo.'),
      quitar: (idEquipo, ci) => http('DELETE', `/equipos/${idEquipo}/plantel/${encodeURIComponent(ci)}`),
    },

    complejos: {
      async listar() {
        const complejos = await complejosRaw();
        const canchas = await Promise.all(complejos.map((c) => get(`/complejos/${c.id_complejo}/canchas`)));
        return complejos.map((c, i) => ({ ...c, cantidad_canchas: canchas[i].length }));
      },
      crear: (b) => http('POST', '/complejos/', { body: pick(b, ['nombre', 'direccion', 'departamento']) }),
      modificar: (id, b) => http('PUT', `/complejos/${id}`, { body: pick(b, ['nombre', 'direccion', 'departamento']) }),
      eliminar: (id) => http('DELETE', `/complejos/${id}`),
    },

    canchas: {
      async listar(q = {}) {
        let complejos = await complejosRaw();
        if (q.id_complejo) complejos = complejos.filter((c) => c.id_complejo === Number(q.id_complejo));
        const canchas = await Promise.all(complejos.map((c) => get(`/complejos/${c.id_complejo}/canchas`)));
        return complejos.flatMap((c, i) => canchas[i].map((k) => ({ ...k, techada: bool(k.techada), complejo: c.nombre })));
      },
      crear: (b) => http('POST', `/complejos/${b.id_complejo}/canchas`, { body: { nombre_cancha: b.nombre_cancha, superficie: b.superficie, techada: Boolean(b.techada) } }),
      modificar: (idComplejo, nombre, b) => http('PUT', `/complejos/${idComplejo}/canchas/${encodeURIComponent(nombre)}`, { body: { superficie: b.superficie, techada: Boolean(b.techada) } }),
      eliminar: (idComplejo, nombre) => http('DELETE', `/complejos/${idComplejo}/canchas/${encodeURIComponent(nombre)}`),
    },

    partidos: {
      async listar(q = {}) {
        let lista = await partidosExpandidos(q.id_torneo);
        if (q.numero_fecha) lista = lista.filter((p) => p.numero_fecha === Number(q.numero_fecha));
        if (q.estado) lista = lista.filter((p) => p.estado === q.estado);
        return lista.sort((a, b) => a.numero_fecha - b.numero_fecha || a.dia.localeCompare(b.dia) || a.id_turno - b.id_turno);
      },
      async obtener(id) {
        const [p, equipos, complejos] = await Promise.all([get(`/partidos/${id}`).then(normPartido), equiposRaw(), complejosRaw()]);
        return expandirPartido(p, equipos, complejos, p.estado === 'jugado' ? await planillaRaw(id) : null);
      },
      crear: (b) => http('POST', '/partidos/', {
        body: pick(b, ['id_torneo', 'numero_fecha', 'id_equipo_local', 'id_equipo_visitante', 'dia', 'id_turno', 'nombre_cancha', 'id_complejo']),
      }),
      modificar: (id, b) => http('PUT', `/partidos/${id}`, {
        body: pick(b, ['numero_fecha', 'id_equipo_local', 'id_equipo_visitante', 'dia', 'id_turno', 'nombre_cancha', 'id_complejo']),
      }),
      cambiarEstado(id, estado) {
        if (estado === 'jugado') return Promise.reject(new ApiError(409, 'El partido queda como jugado automáticamente al guardar la planilla.'));
        return http('PUT', `/partidos/${id}`, { body: { estado } });
      },
      eliminar: (id) => http('DELETE', `/partidos/${id}`),

      async planilla(id) {
        const p = normPartido(await get(`/partidos/${id}`));
        const [equipos, complejos, planilla, plantelL, plantelV, sanciones] = await Promise.all([
          equiposRaw(), complejosRaw(), planillaRaw(id), plantelRaw(p.id_equipo_local), plantelRaw(p.id_equipo_visitante), sancionesRaw(p.id_torneo),
        ]);
        const partido = expandirPartido(p, equipos, complejos, planilla);
        const enPlanilla = new Map(planilla.jugadores.map((j) => [j.ci_jugador, j]));
        const fila = (j, idEquipo) => {
          const s = sancionesQueCubren(sanciones, j.ci_jugador, p.numero_fecha);
          return {
            ci: j.ci_jugador, id_equipo: idEquipo, nombre: j.nombre, apellido: j.apellido, numero_camiseta: j.numero_camiseta,
            suspendido: s.length > 0, motivo_suspension: s.map((x) => x.motivo).join(', ') || null, en_planilla: enPlanilla.has(j.ci_jugador),
          };
        };
        const ordenar = (l) => l.sort((a, b) => a.numero_camiseta - b.numero_camiseta);

        // Jugadores una sola vez (pasa a jugado); goles y tarjetas dentro de las 48 h
        const fin = finDelPartido(p);
        const dentroDeVentana = fin ? Date.now() <= fin.getTime() + HORAS_CORRECCION * 3600e3 : false;
        let motivo_no_editable = null;
        if (p.estado === 'cancelado' || p.estado === 'postergado') motivo_no_editable = `El partido está ${p.estado}: no se registra planilla.`;
        else if (!partido.horario_cumplido) motivo_no_editable = 'La planilla se registra una vez disputado el partido (su día y turno todavía no pasaron).';
        else if (!dentroDeVentana) motivo_no_editable = `Pasaron más de ${HORAS_CORRECCION} horas desde el partido: ya no se puede modificar.`;
        const editable_planilla = !motivo_no_editable && p.estado === 'programado';
        const editable_eventos = !motivo_no_editable && p.estado === 'jugado';
        const nombreEn = (ci) => nombreDe(enPlanilla.get(ci)) || ci;

        return {
          partido,
          editable: editable_planilla || editable_eventos,
          editable_planilla, editable_eventos, motivo_no_editable,
          local: ordenar(plantelL.map((j) => fila(j, p.id_equipo_local))),
          visitante: ordenar(plantelV.map((j) => fila(j, p.id_equipo_visitante))),
          goles: planilla.goles.map((g) => ({ ...g, jugador: nombreEn(g.ci_jugador), id_equipo: enPlanilla.get(g.ci_jugador)?.id_equipo ?? null })).sort((a, b) => a.minuto - b.minuto),
          tarjetas: planilla.tarjetas.map((t) => ({ ...t, jugador: nombreEn(t.ci_jugador), id_equipo: enPlanilla.get(t.ci_jugador)?.id_equipo ?? null })).sort((a, b) => a.minuto - b.minuto),
        };
      },
      guardarPlanilla: (id, jugadores) => http('POST', `/partidos/${id}/planilla/jugadores`, { body: { jugadores } }),
      agregarGol: (id, b) => http('POST', `/partidos/${id}/goles`, { body: { ci_jugador: b.ci_jugador, minuto: Number(b.minuto), autogol: Boolean(b.autogol) } }),
      agregarTarjeta: (id, b) => http('POST', `/partidos/${id}/tarjetas`, { body: { ci_jugador: b.ci_jugador, minuto: Number(b.minuto), color: b.color } }),
    },
    eliminarGol: (idPartido, idGol) => http('DELETE', `/partidos/${idPartido}/goles/${idGol}`),
    eliminarTarjeta: (idPartido, idTarjeta) => http('DELETE', `/partidos/${idPartido}/tarjetas/${idTarjeta}`),

    sanciones: {
      async listar(q = {}) {
        const [sanciones, mapa] = await Promise.all([sancionesRaw(q.id_torneo), mapaJugadorEquipo(q.id_torneo)]);
        return sanciones.map((s) => ({
          ...s, jugador: nombreDe(s), equipo: mapa.get(s.ci_jugador)?.equipo ?? null, automatica: s.motivo !== 'disciplinaria',
        })).sort((a, b) => b.numero_fecha_inicio - a.numero_fecha_inicio);
      },
      crear: (b) => http('POST', '/sanciones/', {
        body: { ci_jugador: b.ci_jugador, id_torneo: Number(b.id_torneo), motivo: 'disciplinaria', numero_fecha_inicio: Number(b.numero_fecha_inicio), cantidad_fechas: Number(b.cantidad_fechas) },
      }),
      modificar: (id, b) => http('PUT', `/sanciones/${id}`, { body: { numero_fecha_inicio: Number(b.numero_fecha_inicio), cantidad_fechas: Number(b.cantidad_fechas) } }),
      eliminar: (id) => http('DELETE', `/sanciones/${id}`),
    },

    reporte,
  };
}
