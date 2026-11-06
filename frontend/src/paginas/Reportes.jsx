import { useState } from 'react';
import { api, USE_MOCK } from '../api/client.js';
import { useApp } from '../context.jsx';
import { Encabezado, Estado, Tabla, useDatos, SinTorneo } from '../componentes.jsx';

const barra = (campo) => (f, filas) => {
  const max = Math.max(1, ...filas.map((x) => x[campo]));
  return <div className="fila" style={{ flexWrap: 'nowrap' }}><div className="barra-h" style={{ flex: 1 }}><i style={{ width: `${(f[campo] * 100) / max}%` }} /></div><b style={{ width: 28, textAlign: 'right' }}>{f[campo]}</b></div>;
};

const REPORTES = [
  {
    clave: 'posiciones', titulo: 'Tabla de posiciones', desc: 'Ordenada por puntos; desempata diferencia de gol y luego goles a favor. Ganado 3, empate 1, derrota 0.',
    columnas: [
      { titulo: '#', campo: 'pos' }, { titulo: 'Equipo', render: (f) => <b>{f.equipo}</b> },
      ...['pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'dg'].map((c) => ({ titulo: c.toUpperCase(), campo: c, num: true })),
      { titulo: 'Pts', render: (f) => <b>{f.pts}</b>, num: true },
    ],
  },
  {
    clave: 'goleadores', titulo: 'Goleadores', desc: 'Los 10 jugadores con más goles (no cuenta goles en contra).',
    columnas: [{ titulo: '#', campo: 'pos' }, { titulo: 'Jugador', campo: 'jugador' }, { titulo: 'Equipo', campo: 'equipo' }, { titulo: 'Goles', render: barra('goles') }],
  },
  {
    clave: 'fair-play', titulo: 'Fair play', desc: '1 punto por amarilla y 3 por roja. Gana el de menor puntaje.',
    columnas: [{ titulo: '#', campo: 'pos' }, { titulo: 'Equipo', campo: 'equipo' }, ...(USE_MOCK ? [{ titulo: 'Amarillas', campo: 'amarillas', num: true }, { titulo: 'Rojas', campo: 'rojas', num: true }] : []), { titulo: 'Puntaje', render: (f) => <b>{f.puntaje}</b>, num: true }],
    destacar: (f) => f.pos === 1,
  },
  {
    clave: 'promedio-goles', titulo: 'Promedio de goles', desc: 'Goles por partido jugado, en cada fecha y en toda la edición.',
    columnas: [{ titulo: 'Fecha', campo: 'fecha' }, { titulo: 'Partidos', campo: 'partidos', num: true }, { titulo: 'Goles', campo: 'goles', num: true }, { titulo: 'Promedio', render: (f) => <b>{f.promedio.toFixed(2)}</b>, num: true }],
    destacar: (f) => f.total,
  },
  { clave: 'uso-canchas', titulo: 'Canchas y turnos', desc: 'Partidos asignados (sin contar cancelados).', especial: 'uso' },
  {
    clave: 'jugadores-facultad-tipo', titulo: 'Jugadores por facultad', desc: 'Jugadores inscriptos en planteles de la edición, por facultad y tipo.',
    columnas: [{ titulo: 'Facultad', campo: 'facultad' }, ...['grado', 'posgrado', 'docente', 'funcionario'].map((c) => ({ titulo: c, campo: c, num: true })), { titulo: 'Total', render: (f) => <b>{f.total}</b>, num: true }],
  },
  {
    clave: 'nunca-jugaron', titulo: 'Nunca jugaron', desc: 'Inscriptos en un plantel que nunca figuraron en una planilla de juego.',
    columnas: [{ titulo: 'Jugador', campo: 'jugador' }, { titulo: 'CI', campo: 'ci' }, { titulo: 'Equipo', campo: 'equipo' }, { titulo: 'Camiseta', render: (f) => f.camiseta ?? '—', num: true }],
  },
  {
    clave: 'sanciones-equipo', titulo: 'Sanciones por equipo', desc: 'Cantidad de sanciones por equipo y por motivo.',
    columnas: [{ titulo: 'Equipo', campo: 'equipo' }, { titulo: 'Roja', campo: 'roja', num: true }, { titulo: 'Acum. amarillas', campo: 'acumulacion', num: true }, { titulo: 'Disciplinaria', campo: 'disciplinaria', num: true }, { titulo: 'Total', render: (f) => <b>{f.total}</b>, num: true }],
  },
  {
    clave: 'estado-partidos', titulo: 'Jugados vs. no jugados', desc: 'Porcentaje de partidos jugados frente a postergados y cancelados.',
    columnas: [{ titulo: 'Estado', render: (f) => <span className={`chip ${f.estado.split(' ')[0]}`}>{f.estado}</span> }, { titulo: 'Partidos', campo: 'partidos', num: true },
      { titulo: '%', render: (f) => <div className="fila" style={{ flexWrap: 'nowrap' }}><div className="barra-h" style={{ flex: 1 }}><i style={{ width: `${f.porcentaje}%` }} /></div><b style={{ width: 48, textAlign: 'right' }}>{f.porcentaje}%</b></div> }],
  },
  {
    clave: 'racha-invicta', titulo: 'Partidos sin perder', extra: true, desc: 'Partidos ganados o empatados por cada equipo.',
    columnas: [{ titulo: '#', campo: 'pos' }, { titulo: 'Equipo', campo: 'equipo' }, { titulo: 'Sin perder', render: barra('partidos_sin_perder') }],
  },
  {
    clave: 'fecha-mas-goles', titulo: 'Fecha con más goles', extra: true, desc: 'Goles convertidos en cada fecha, de mayor a menor.',
    columnas: [{ titulo: 'Fecha', campo: 'fecha' }, { titulo: 'Goles', render: barra('goles') }],
    destacar: (f, i) => i === 0,
  },
  {
    clave: 'equipos-sin-sanciones', titulo: 'Equipos sin sanciones', extra: true, desc: 'Equipos cuyos jugadores no recibieron ninguna sanción en la edición.',
    columnas: [{ titulo: 'Equipo', campo: 'equipo' }],
  },
];

export default function Reportes() {
  const { idTorneo, torneo } = useApp();
  const [clave, setClave] = useState('posiciones');
  const def = REPORTES.find((r) => r.clave === clave);
  const resp = useDatos(async () => (idTorneo ? { clave, filas: await api.reporte(clave, idTorneo) } : null), [clave, idTorneo]);
  if (!idTorneo) return <SinTorneo />;
  const datos = resp.datos?.clave === clave ? resp.datos.filas : null;
  const cargando = resp.cargando || !datos;
  const { error } = resp;

  const columnas = (def.columnas || []).map((c) => (c.render && c.render.length === 2 ? { ...c, render: (f) => c.render(f, datos) } : c));

  return (
    <>
      <Encabezado titulo="Reportes" subtitulo={`Métricas de ${torneo?.nombre} (${torneo?.anio}-${torneo?.semestre}) para el área de Deportes.`}>
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
      </Encabezado>
      <div className="tabs" role="tablist">
        {REPORTES.map((r) => (
          <button key={r.clave} role="tab" aria-selected={r.clave === clave} className={r.clave === clave ? 'activo' : ''} onClick={() => setClave(r.clave)}>
            {r.titulo}{r.extra && <span className="extra">extra</span>}
          </button>
        ))}
      </div>
      <div className="tarjeta">
        <div style={{ padding: '16px 16px 8px' }}><h2>{def.titulo}</h2><p className="muted" style={{ margin: '4px 0 0' }}>{def.desc}</p></div>
        <Estado cargando={cargando} error={error}>
          {def.especial === 'uso' && datos?.canchas ? (
            <div className="grilla dos" style={{ padding: 16 }}>
              <div><h3 style={{ marginBottom: 6 }}>Canchas</h3><Tabla filas={datos.canchas} columnas={[{ titulo: 'Cancha', campo: 'cancha' }, { titulo: 'Partidos', render: (f) => barra('partidos')(f, datos.canchas) }]} /></div>
              <div><h3 style={{ marginBottom: 6 }}>Turnos</h3><Tabla filas={datos.turnos} columnas={[{ titulo: 'Turno', campo: 'turno' }, { titulo: 'Partidos', render: (f) => barra('partidos')(f, datos.turnos) }]} /></div>
            </div>
          ) : Array.isArray(datos) && <Tabla filas={datos} columnas={columnas} destacar={def.destacar} vacio="Sin datos para esta edición." />}
        </Estado>
      </div>
    </>
  );
}
