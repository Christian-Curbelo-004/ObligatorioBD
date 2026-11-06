import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useApp } from '../context.jsx';
import { Encabezado, Estado, Tabla, useDatos, SinTorneo } from '../componentes.jsx';
import { diaSemana, hhmm } from '../validacion.js';

function tablaPosiciones(partidos, equipos) {
  const filas = new Map(equipos.map((e) => [e.id_equipo, { equipo: e.nombre, pj: 0, dg: 0, gf: 0, pts: 0 }]));
  for (const p of partidos) {
    if (p.estado !== 'jugado' || p.goles_local == null) continue;
    const L = filas.get(p.id_equipo_local), V = filas.get(p.id_equipo_visitante);
    if (!L || !V) continue;
    const gl = p.goles_local, gv = p.goles_visitante;
    L.pj++; V.pj++; L.gf += gl; V.gf += gv; L.dg += gl - gv; V.dg += gv - gl;
    if (gl > gv) L.pts += 3; else if (gl < gv) V.pts += 3; else { L.pts++; V.pts++; }
  }
  return [...filas.values()].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf).map((f, i) => ({ pos: i + 1, ...f }));
}

export default function Inicio() {
  const { idTorneo, torneo } = useApp();
  const { datos, cargando, error } = useDatos(async () => {
    if (!idTorneo) return null;
    const [partidos, equipos, sanciones] = await Promise.all([
      api.partidos.listar({ id_torneo: idTorneo }),
      api.equipos.listar({ id_torneo: idTorneo }),
      api.sanciones.listar({ id_torneo: idTorneo }),
    ]);
    return { partidos, equipos, sanciones, posiciones: tablaPosiciones(partidos, equipos) };
  }, [idTorneo]);

  if (!idTorneo) return <SinTorneo />;
  const jugados = datos?.partidos.filter((p) => p.estado === 'jugado') || [];
  const proximos = datos?.partidos.filter((p) => p.estado === 'programado') || [];
  const sinPlanilla = datos?.partidos.filter((p) => p.estado === 'programado' && p.horario_cumplido) || [];

  return (
    <>
      <Encabezado titulo={torneo?.nombre} subtitulo={`Edición ${torneo?.anio}-${torneo?.semestre} · ${torneo?.estado === 'inscripcion' ? 'inscripción' : torneo?.estado}`} />
      <Estado cargando={cargando} error={error}>
        {datos && <>
          <div className="grilla cuatro" style={{ marginBottom: 16 }}>
            <div className="tarjeta stat"><b>{datos.equipos.length}</b><span>equipos inscriptos</span></div>
            <div className="tarjeta stat"><b>{jugados.length}/{datos.partidos.length}</b><span>partidos jugados</span></div>
            <div className="tarjeta stat"><b>{datos.posiciones.reduce((a, f) => a + f.gf, 0)}</b><span>goles convertidos</span></div>
            <div className="tarjeta stat"><b>{datos.sanciones.length}</b><span>sanciones aplicadas</span></div>
          </div>
          {sinPlanilla.length > 0 && (
            <div className="alerta aviso" style={{ marginBottom: 16 }}>
              {sinPlanilla.length} partido(s) ya se disputaron y siguen sin planilla. <Link to="/partidos">Ir a partidos</Link>
            </div>
          )}
          <div className="grilla dos">
            <div className="tarjeta">
              <div className="fila" style={{ padding: '14px 16px 6px' }}><h3>Posiciones</h3><span className="espacio" /><Link className="chico" to="/reportes">Ver reportes</Link></div>
              <Tabla filas={datos.posiciones} clave={(f) => f.equipo} columnas={[
                { titulo: '#', campo: 'pos' }, { titulo: 'Equipo', campo: 'equipo' },
                { titulo: 'PJ', campo: 'pj', num: true }, { titulo: 'DG', campo: 'dg', num: true }, { titulo: 'Pts', render: (f) => <b>{f.pts}</b>, num: true },
              ]} />
            </div>
            <div className="tarjeta">
              <div className="fila" style={{ padding: '14px 16px 6px' }}><h3>Próximos partidos</h3></div>
              <Tabla filas={proximos.slice(0, 6)} clave={(p) => p.id_partido} vacio="No hay partidos programados." columnas={[
                { titulo: 'Fecha', render: (p) => `F${p.numero_fecha}` },
                { titulo: 'Partido', render: (p) => `${p.equipo_local} vs ${p.equipo_visitante}` },
                { titulo: 'Cuándo', render: (p) => <span className="chico">{diaSemana(p.dia)} {hhmm(p.hora_inicio)}<br /><span className="muted">{p.nombre_cancha} · {p.complejo}</span></span> },
              ]} />
            </div>
          </div>
        </>}
      </Estado>
    </>
  );
}
