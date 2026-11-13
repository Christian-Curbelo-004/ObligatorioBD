import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, CAPACIDADES } from '../api/client.js';
import { useApp } from '../context.jsx';
import { BotonAccion, Chip, useDatos } from '../componentes.jsx';
import { diaSemana, hhmm } from '../validacion.js';

export default function Planilla() {
  const { id } = useParams();
  const { avisar } = useApp();
  const { datos, cargando, error, recargar } = useDatos(() => api.partidos.planilla(id), [id]);
  const [marcados, setMarcados] = useState(new Set());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (datos) setMarcados(new Set([...datos.local, ...datos.visitante].filter((j) => j.en_planilla).map((j) => j.ci)));
  }, [datos]);

  if (cargando && !datos) return <div className="vacio">Cargando…</div>;
  if (error) return <div className="alerta error">{error.message}</div>;
  const { partido: p, editable, motivo_no_editable } = datos;
  const editablePlanilla = datos.editable_planilla ?? editable;
  const editableEventos = datos.editable_eventos ?? editable;
  const todos = [...datos.local, ...datos.visitante];
  const guardadas = new Set(todos.filter((j) => j.en_planilla).map((j) => j.ci));
  const sinGuardar = marcados.size !== guardadas.size || [...marcados].some((ci) => !guardadas.has(ci));
  const enPlanilla = todos.filter((j) => j.en_planilla);
  const conEventos = new Set([...datos.goles, ...datos.tarjetas].map((x) => x.ci_jugador));

  const golesDe = (idEq) => datos.goles.filter((g) => (g.autogol ? g.id_equipo !== idEq : g.id_equipo === idEq)).length;
  const marcador = `${golesDe(p.id_equipo_local)} - ${golesDe(p.id_equipo_visitante)}`;

  const alternar = (j) => {
    const s = new Set(marcados);
    if (s.has(j.ci)) {
      if (conEventos.has(j.ci)) return avisar(`${j.nombre} tiene goles o tarjetas: borralos primero.`, 'error');
      s.delete(j.ci);
    } else s.add(j.ci);
    setMarcados(s);
  };
  const guardarPlanilla = async () => {
    const porEquipo = (eq, lista) => lista.filter((j) => marcados.has(j.ci)).length;
    if (porEquipo(p.id_equipo_local, datos.local) === 0 || porEquipo(p.id_equipo_visitante, datos.visitante) === 0) {
      if (!window.confirm('Uno de los equipos no tiene jugadores marcados. ¿Guardar igual?')) return;
    }
    if (!CAPACIDADES.corregirPlanilla && !window.confirm('Al guardar, el partido queda como jugado y la lista de jugadores ya no se puede cambiar. ¿Continuar?')) return;
    setGuardando(true);
    try {
      const jugadores = todos.filter((j) => marcados.has(j.ci)).map((j) => ({ ci_jugador: j.ci, id_equipo: j.id_equipo }));
      await api.partidos.guardarPlanilla(p.id_partido, jugadores);
      avisar('Planilla guardada.');
      recargar();
    } catch (e) { avisar(e.message, 'error'); } finally { setGuardando(false); }
  };

  return (
    <>
      <div className="fila" style={{ marginBottom: 12 }}>
        <Link to="/partidos" className="btn chico">← Partidos</Link>
        <span className="muted chico">Fecha {p.numero_fecha} · {diaSemana(p.dia)} {hhmm(p.hora_inicio)}–{hhmm(p.hora_fin)} · {p.nombre_cancha}, {p.complejo}</span>
        <span className="espacio" />
        <Chip valor={p.estado} />
      </div>
      <div className="planilla-cab">
        <h2 style={{ textAlign: 'right' }}>{p.equipo_local}</h2>
        <div className="marcador">{marcador}</div>
        <h2>{p.equipo_visitante}</h2>
      </div>

      {!editable && <div className="alerta aviso" style={{ marginBottom: 14 }}>{motivo_no_editable}</div>}
      {editable && p.estado === 'jugado' && p.corregible_hasta && (
        <div className="alerta aviso" style={{ marginBottom: 14 }}>
          Partido jugado: el resultado puede corregirse hasta el {new Date(p.corregible_hasta).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' })} (48 horas).
        </div>
      )}

      <div className="grilla dos" style={{ marginBottom: 16 }}>
        {[['local', p.equipo_local, datos.local], ['visitante', p.equipo_visitante, datos.visitante]].map(([lado, nombre, lista]) => (
          <div className="tarjeta" key={lado}>
            <div className="fila" style={{ padding: '14px 14px 8px' }}><h3>{nombre}</h3><span className="espacio" /><span className="chico muted">{lista.filter((j) => marcados.has(j.ci)).length} en planilla</span></div>
            <ul className="lista-jug">
              {lista.map((j) => (
                <li key={j.ci} className={j.suspendido ? 'off' : ''}>
                  <input type="checkbox" disabled={!editablePlanilla || j.suspendido} checked={marcados.has(j.ci)} onChange={() => alternar(j)} aria-label={`${j.nombre} en planilla`} />
                  <span className="dorsal">{j.numero_camiseta}</span>
                  <span>{j.nombre} {j.apellido}</span>
                  <span className="espacio" />
                  {j.suspendido && <span className="chip suspendido" title={j.motivo_suspension}>suspendido · {j.motivo_suspension}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {editablePlanilla && (
        <div className="fila" style={{ marginBottom: 22 }}>
          <button className="btn primario" disabled={!sinGuardar || guardando} onClick={guardarPlanilla}>{guardando ? 'Guardando…' : 'Guardar planilla'}</button>
          {sinGuardar && <span className="chico" style={{ color: 'var(--aviso)' }}>Hay cambios sin guardar. Goles y tarjetas solo para jugadores de la planilla guardada.</span>}
          {!CAPACIDADES.corregirPlanilla && <span className="chico muted">Marcá quiénes jugaron y guardá: después se cargan goles y tarjetas.</span>}
          <span className="espacio" />
          {p.estado === 'programado' && CAPACIDADES.marcarJugadoManual && (
            <BotonAccion clase="btn" confirmar="¿Confirmar el resultado y marcar el partido como jugado?" accion={() => api.partidos.cambiarEstado(p.id_partido, 'jugado')} onHecho={recargar} textoOk="Partido marcado como jugado.">
              Marcar como jugado
            </BotonAccion>
          )}
        </div>
      )}

      <div className="grilla dos">
        <Eventos titulo="Goles" tipo="gol" lista={datos.goles} enPlanilla={enPlanilla} editable={editableEventos} partido={p} onCambio={recargar} />
        <Eventos titulo="Tarjetas" tipo="tarjeta" lista={datos.tarjetas} enPlanilla={enPlanilla} editable={editableEventos} partido={p} onCambio={recargar} />
      </div>
    </>
  );
}

function Eventos({ titulo, tipo, lista, enPlanilla, editable, partido, onCambio }) {
  const { avisar } = useApp();
  const [f, setF] = useState({ ci_jugador: '', minuto: '', autogol: false, color: 'amarilla' });
  const [err, setErr] = useState(null);
  const nombreEquipo = (idEq) => (idEq === partido.id_equipo_local ? partido.equipo_local : partido.equipo_visitante);

  const agregar = async (e) => {
    e.preventDefault();
    const min = Number(f.minuto);
    if (!f.ci_jugador) return setErr('Elegí un jugador de la planilla.');
    if (f.minuto === '' || !Number.isInteger(min) || min < 1 || min > 60) return setErr('Minuto: entero entre 1 y 60.');
    try {
      if (tipo === 'gol') await api.partidos.agregarGol(partido.id_partido, { ci_jugador: f.ci_jugador, minuto: min, autogol: f.autogol });
      else {
        const r = await api.partidos.agregarTarjeta(partido.id_partido, { ci_jugador: f.ci_jugador, minuto: min, color: f.color });
        if (r && f.color === 'roja') avisar('Roja registrada: se generó la suspensión para la fecha siguiente.');
      }
      setF({ ...f, ci_jugador: '', minuto: '', autogol: false }); setErr(null);
      onCambio();
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <div className="tarjeta">
      <div style={{ padding: '14px 14px 8px' }}><h3>{titulo}</h3></div>
      {lista.length ? (
        <ul className="eventos">
          {lista.map((x) => (
            <li key={x.id_gol ?? x.id_tarjeta}>
              <span className="min">{x.minuto}'</span>
              {tipo === 'tarjeta' ? <span className={`naipe ${x.color}`} /> : <span>⚽</span>}
              <span>{x.jugador}{x.autogol && <b className="chico" style={{ color: 'var(--peligro)' }}> (en contra)</b>}<span className="chico muted"> · {nombreEquipo(x.id_equipo)}</span></span>
              <span className="espacio" />
              {editable && CAPACIDADES.borrarEventos && <BotonAccion clase="btn chico fantasma" confirmar={`¿Borrar ${tipo === 'gol' ? 'el gol' : 'la tarjeta'}?`}
                accion={() => (tipo === 'gol' ? api.eliminarGol(partido.id_partido, x.id_gol) : api.eliminarTarjeta(partido.id_partido, x.id_tarjeta))} onHecho={onCambio}>✕</BotonAccion>}
            </li>
          ))}
        </ul>
      ) : <div className="vacio" style={{ padding: 18 }}>Sin {titulo.toLowerCase()}.</div>}
      {editable && (
        <form onSubmit={agregar} noValidate style={{ padding: 14, borderTop: '1px solid var(--linea)', display: 'grid', gap: 8 }}>
          {err && <div className="alerta error">{err}</div>}
          <div className="fila">
            <select className="control" style={{ flex: 1, minWidth: 180 }} value={f.ci_jugador} onChange={(e) => setF({ ...f, ci_jugador: e.target.value })}>
              <option value="">— Jugador en planilla —</option>
              {enPlanilla.map((j) => <option key={j.ci} value={j.ci}>{j.numero_camiseta}. {j.nombre} {j.apellido} ({nombreEquipo(j.id_equipo)})</option>)}
            </select>
            <input className="control" type="number" min="1" max="60" placeholder="Min" style={{ width: 76 }} value={f.minuto} onChange={(e) => setF({ ...f, minuto: e.target.value })} />
            {tipo === 'gol'
              ? <label className="check chico"><input type="checkbox" checked={f.autogol} onChange={(e) => setF({ ...f, autogol: e.target.checked })} /> En contra</label>
              : <select className="control" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })}><option value="amarilla">Amarilla</option><option value="roja">Roja</option></select>}
            <button className="btn primario">Agregar</button>
          </div>
        </form>
      )}
    </div>
  );
}
