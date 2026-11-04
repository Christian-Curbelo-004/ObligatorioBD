import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApp } from '../context.jsx';
import { BotonAccion, Chip, Encabezado, Estado, FormModal, useDatos, SinTorneo } from '../componentes.jsx';
import { diaSemana, hhmm, reglas } from '../validacion.js';

export default function Partidos() {
  const { idTorneo, esAdmin, torneo } = useApp();
  const [filtroEstado, setFiltroEstado] = useState('');
  const { datos, cargando, error, recargar } = useDatos(async () => {
    if (!idTorneo) return null;
    const [partidos, equipos, turnos, canchas] = await Promise.all([
      api.partidos.listar({ id_torneo: idTorneo }), api.equipos.listar({ id_torneo: idTorneo }), api.turnos(), api.canchas.listar(),
    ]);
    return { partidos, equipos, turnos, canchas };
  }, [idTorneo]);
  const [editando, setEditando] = useState(null);

  const porFecha = useMemo(() => {
    const g = {};
    for (const p of datos?.partidos || []) {
      if (filtroEstado && p.estado !== filtroEstado) continue;
      (g[p.numero_fecha] ??= []).push(p);
    }
    return Object.entries(g).sort((a, b) => a[0] - b[0]);
  }, [datos, filtroEstado]);

  if (!idTorneo) return <SinTorneo />;
  const ultimaFecha = Math.max(0, ...(datos?.partidos || []).map((p) => p.numero_fecha));

  return (
    <>
      <Encabezado titulo="Partidos" subtitulo={esAdmin ? 'Fixture de la edición. Liga a una rueda: todos contra todos una vez.' : 'Elegí un partido disputado para cargar su planilla, goles y tarjetas.'}>
        <select className="control" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {['programado', 'jugado', 'postergado', 'cancelado'].map((e) => <option key={e}>{e}</option>)}
        </select>
        {esAdmin && <button className="btn primario" disabled={torneo?.estado === 'finalizado'} onClick={() => setEditando({ numero_fecha: String(ultimaFecha || 1) })}>+ Programar partido</button>}
      </Encabezado>
      <Estado cargando={cargando} error={error} vacio={!porFecha.length} textoVacio="No hay partidos para mostrar.">
        {porFecha.map(([fecha, partidos]) => (
          <section className="fecha-bloque" key={fecha}>
            <h3>Fecha {fecha}</h3>
            <div className="tarjeta">
              {partidos.map((p) => <FilaPartido key={p.id_partido} p={p} esAdmin={esAdmin} onEditar={() => setEditando(p)} onCambio={recargar} />)}
            </div>
          </section>
        ))}
      </Estado>
      {editando && datos && <FormPartido inicial={editando} datos={datos} idTorneo={idTorneo} onCerrar={() => setEditando(null)} onGuardado={recargar} />}
    </>
  );
}

function FilaPartido({ p, esAdmin, onEditar, onCambio }) {
  const jugado = p.estado === 'jugado';
  const puedePlanilla = p.estado === 'jugado' || (p.estado === 'programado' && p.horario_cumplido);
  const estado = (e) => () => api.partidos.cambiarEstado(p.id_partido, e);
  return (
    <div className="partido">
      <div className="local">{p.equipo_local}</div>
      <div className={`marcador ${jugado ? '' : 'vs'}`}>{jugado ? `${p.goles_local} - ${p.goles_visitante}` : 'vs'}</div>
      <div className="visit">{p.equipo_visitante}</div>
      <div className="acciones">
        {puedePlanilla && <Link className={`btn chico ${!jugado ? 'primario' : ''}`} to={`/partidos/${p.id_partido}/planilla`}>{jugado ? 'Planilla' : 'Cargar planilla'}</Link>}
        {esAdmin && !jugado && <>
          {p.estado !== 'cancelado' && <button className="btn chico" onClick={onEditar}>Editar</button>}
          {p.estado === 'programado' && <BotonAccion confirmar="¿Postergar este partido?" accion={estado('postergado')} onHecho={onCambio} textoOk="Partido postergado.">Postergar</BotonAccion>}
          {p.estado === 'postergado' && <BotonAccion accion={estado('programado')} onHecho={onCambio} textoOk="Partido reprogramado.">Reprogramar</BotonAccion>}
          {p.estado !== 'cancelado' && <BotonAccion clase="btn chico peligro" confirmar="¿Cancelar este partido? Los equipos podrán volver a enfrentarse." accion={estado('cancelado')} onHecho={onCambio} textoOk="Partido cancelado.">Cancelar</BotonAccion>}
          <BotonAccion clase="btn chico peligro" confirmar="¿Eliminar el partido?" accion={() => api.partidos.eliminar(p.id_partido)} onHecho={onCambio} textoOk="Partido eliminado.">Eliminar</BotonAccion>
        </>}
      </div>
      <div className="meta">
        <Chip valor={p.estado} /> &nbsp;{diaSemana(p.dia)} · {hhmm(p.hora_inicio)}–{hhmm(p.hora_fin)} · {p.nombre_cancha}, {p.complejo}
        {p.estado === 'programado' && p.horario_cumplido && <b style={{ color: 'var(--aviso)' }}> · falta la planilla</b>}
      </div>
    </div>
  );
}

function FormPartido({ inicial, datos, idTorneo, onCerrar, onGuardado }) {
  const { equipos, turnos, canchas, partidos } = datos;
  const editar = Boolean(inicial.id_partido);
  const activos = partidos.filter((x) => x.estado !== 'cancelado' && x.id_partido !== inicial.id_partido);
  const nombreEq = (id) => equipos.find((e) => e.id_equipo === Number(id))?.nombre;

  const reglasEquipo = (lado) => [reglas.requerido, (v, f) => {
    const e = equipos.find((x) => x.id_equipo === Number(v));
    if (e && e.cantidad_jugadores < 5) return `${e.nombre} tiene menos de 5 jugadores`;
    if (lado === 'v' && v && v === f.id_equipo_local) return 'No puede enfrentarse a sí mismo';
    if (v && f.numero_fecha && activos.some((x) => x.numero_fecha === Number(f.numero_fecha) && (x.id_equipo_local === Number(v) || x.id_equipo_visitante === Number(v)))) return `Ya juega en la fecha ${f.numero_fecha}`;
    if (lado === 'v' && v && f.id_equipo_local) {
      const a = Number(f.id_equipo_local), b = Number(v);
      const ya = activos.find((x) => (x.id_equipo_local === a && x.id_equipo_visitante === b) || (x.id_equipo_local === b && x.id_equipo_visitante === a));
      if (ya) return `Ya se enfrentan en la fecha ${ya.numero_fecha}`;
    }
    return null;
  }];
  const reglaCancha = [reglas.requerido, (v, f) => {
    if (!v || !f.dia || !f.id_turno) return null;
    const [idc, nombre] = v.split('|');
    const ocupada = activos.find((x) => x.id_complejo === Number(idc) && x.nombre_cancha === nombre && x.dia === f.dia && x.id_turno === Number(f.id_turno));
    return ocupada ? `Ocupada: ${ocupada.equipo_local} vs ${ocupada.equipo_visitante}` : null;
  }];

  const campos = [
    { name: 'numero_fecha', label: 'Fecha del torneo', type: 'number', min: 1, reglas: [reglas.requerido, reglas.entero(1, 50)], ayuda: 'Fecha 1, fecha 2…' },
    { name: 'dia', label: 'Día', type: 'date', reglas: [reglas.requerido] },
    { name: 'id_equipo_local', label: 'Local', type: 'select', opciones: equipos.map((e) => ({ valor: String(e.id_equipo), texto: `${e.nombre} (${e.cantidad_jugadores} jug.)` })), reglas: reglasEquipo('l') },
    { name: 'id_equipo_visitante', label: 'Visitante', type: 'select', opciones: equipos.map((e) => ({ valor: String(e.id_equipo), texto: `${e.nombre} (${e.cantidad_jugadores} jug.)` })), reglas: reglasEquipo('v') },
    { name: 'id_turno', label: 'Turno', type: 'select', opciones: turnos.map((t) => ({ valor: String(t.id_turno), texto: `${hhmm(t.hora_inicio)} a ${hhmm(t.hora_fin)}` })), reglas: [reglas.requerido] },
    { name: 'cancha', label: 'Cancha', type: 'select', opciones: canchas.map((k) => ({ valor: `${k.id_complejo}|${k.nombre_cancha}`, texto: `${k.nombre_cancha} — ${k.complejo}` })), reglas: reglaCancha },
  ];
  const ini = editar ? {
    ...inicial, numero_fecha: String(inicial.numero_fecha), id_equipo_local: String(inicial.id_equipo_local), id_equipo_visitante: String(inicial.id_equipo_visitante),
    id_turno: String(inicial.id_turno), cancha: `${inicial.id_complejo}|${inicial.nombre_cancha}`,
  } : inicial;

  return (
    <FormModal titulo={editar ? `Editar ${nombreEq(inicial.id_equipo_local)} vs ${nombreEq(inicial.id_equipo_visitante)}` : 'Programar partido'}
      campos={campos} inicial={ini} onCerrar={onCerrar}
      onGuardar={async (v) => {
        const [idc, nombre] = v.cancha.split('|');
        const body = {
          id_torneo: idTorneo, numero_fecha: Number(v.numero_fecha), id_equipo_local: Number(v.id_equipo_local), id_equipo_visitante: Number(v.id_equipo_visitante),
          dia: v.dia, id_turno: Number(v.id_turno), nombre_cancha: nombre, id_complejo: Number(idc),
        };
        if (editar) await api.partidos.modificar(inicial.id_partido, { ...body, estado: inicial.estado }); else await api.partidos.crear(body);
        onGuardado();
      }} />
  );
}
