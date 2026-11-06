import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context.jsx';
import { BotonAccion, Chip, Encabezado, Estado, FormModal, Tabla, useDatos, SinTorneo } from '../componentes.jsx';
import { reglas } from '../validacion.js';

const ES_DOC = (t) => t === 'docente' || t === 'funcionario';

export default function Equipos() {
  const { idTorneo, torneo } = useApp();
  const facultades = useDatos(() => api.facultades(), []);
  const { datos, cargando, error, recargar } = useDatos(() => (idTorneo ? api.equipos.listar({ id_torneo: idTorneo }) : []), [idTorneo]);
  const [sel, setSel] = useState(null);
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    if (datos?.length && !datos.some((e) => e.id_equipo === sel)) setSel(datos[0].id_equipo);
    if (datos && !datos.length) setSel(null);
  }, [datos, sel]);

  if (!idTorneo) return <SinTorneo />;
  const enInscripcion = torneo?.estado === 'inscripcion';
  const equipo = datos?.find((e) => e.id_equipo === sel);
  const opcFac = (facultades.datos || []).map((f) => ({ valor: String(f.id_facultad), texto: f.nombre }));

  return (
    <>
      <Encabezado titulo="Equipos y planteles" subtitulo={enInscripcion ? 'Inscripción abierta: se pueden armar y modificar los planteles.' : `Edición ${torneo?.estado}: los planteles están cerrados.`}>
        <button className="btn primario" disabled={!enInscripcion} title={enInscripcion ? '' : 'Solo durante la inscripción'} onClick={() => setEditando({})}>+ Inscribir equipo</button>
      </Encabezado>
      <Estado cargando={cargando} error={error} vacio={!datos?.length} textoVacio="No hay equipos inscriptos en esta edición.">
        <div className="grilla" style={{ gridTemplateColumns: 'minmax(240px, 320px) 1fr', alignItems: 'start' }}>
          <div className="tarjeta">
            {datos?.map((e) => (
              <button key={e.id_equipo} onClick={() => setSel(e.id_equipo)} className="btn fantasma"
                style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, padding: '12px 16px', borderBottom: '1px solid var(--linea)', background: e.id_equipo === sel ? 'var(--acento-suave)' : undefined }}>
                <span style={{ textAlign: 'left' }}><b>{e.nombre}</b><br /><span className="chico muted">{e.facultad}</span></span>
                <span className={`chip ${e.cantidad_jugadores < 5 ? 'cancelado' : ''}`}>{e.cantidad_jugadores}/10</span>
              </button>
            ))}
          </div>
          {equipo && <DetalleEquipo key={equipo.id_equipo} equipo={equipo} editable={enInscripcion} onCambio={recargar}
            onEditar={() => setEditando({ ...equipo, id_facultad: String(equipo.id_facultad) })} />}
        </div>
      </Estado>
      {editando && (
        <FormModal
          titulo={editando.id_equipo ? `Editar ${editando.nombre}` : 'Inscribir equipo'}
          campos={[
            { name: 'nombre', label: 'Nombre del equipo', reglas: [reglas.requerido, reglas.max(80)], ancho: true },
            { name: 'id_facultad', label: 'Facultad que representa', type: 'select', opciones: opcFac, reglas: [reglas.requerido], ancho: true, disabled: editando.cantidad_jugadores > 0 },
          ]}
          inicial={editando} onCerrar={() => setEditando(null)}
          onGuardar={async (v) => {
            if (editando.id_equipo) await api.equipos.modificar(editando.id_equipo, { nombre: v.nombre, id_facultad: Number(v.id_facultad), ci_capitan: editando.ci_capitan });
            else { const e = await api.equipos.crear({ nombre: v.nombre, id_facultad: Number(v.id_facultad), id_torneo: idTorneo }); setSel(e.id_equipo); }
            recargar();
          }}
        />
      )}
    </>
  );
}

function DetalleEquipo({ equipo, editable, onCambio, onEditar }) {
  const { avisar } = useApp();
  const plantel = useDatos(() => api.plantel.listar(equipo.id_equipo), [equipo.id_equipo]);
  const candidatos = useDatos(() => api.jugadores.listar({ id_facultad: equipo.id_facultad }), [equipo.id_facultad]);
  const [nuevo, setNuevo] = useState({ ci_jugador: '', numero_camiseta: '' });
  const [errorAlta, setErrorAlta] = useState(null);

  const lista = plantel.datos || [];
  const docentes = lista.filter((j) => ES_DOC(j.tipo)).length;
  const enPlantel = new Set(lista.map((j) => j.ci_jugador));
  const disponibles = (candidatos.datos || []).filter((j) => !enPlantel.has(j.ci));
  const refrescar = () => { plantel.recargar(); onCambio(); };

  const agregar = async (e) => {
    e.preventDefault();
    const n = Number(nuevo.numero_camiseta);
    if (!nuevo.ci_jugador) return setErrorAlta('Elegí un jugador.');
    if (!Number.isInteger(n) || n < 1 || n > 99) return setErrorAlta('Camiseta: número entre 1 y 99.');
    if (lista.some((j) => j.numero_camiseta === n)) return setErrorAlta(`La camiseta ${n} ya está usada.`);
    if (lista.length >= 10) return setErrorAlta('El plantel ya tiene 10 jugadores.');
    const j = disponibles.find((x) => x.ci === nuevo.ci_jugador);
    if (j && ES_DOC(j.tipo) && docentes >= 2) return setErrorAlta('Ya hay 2 docentes/funcionarios en el plantel.');
    try {
      await api.plantel.agregar(equipo.id_equipo, { ci_jugador: nuevo.ci_jugador, numero_camiseta: n });
      setNuevo({ ci_jugador: '', numero_camiseta: '' }); setErrorAlta(null);
      avisar('Jugador agregado al plantel.');
      refrescar();
    } catch (err) { setErrorAlta(err.message); }
  };
  const hacerCapitan = async (ci) => {
    try { await api.equipos.modificar(equipo.id_equipo, { nombre: equipo.nombre, ci_capitan: ci }); avisar('Capitán actualizado.'); refrescar(); } catch (e) { avisar(e.message, 'error'); }
  };

  return (
    <div className="tarjeta">
      <div className="fila" style={{ padding: 16, borderBottom: '1px solid var(--linea)' }}>
        <div>
          <h2>{equipo.nombre}</h2>
          <div className="chico muted">{equipo.facultad} · Capitán: {equipo.capitan || <b style={{ color: 'var(--peligro)' }}>sin asignar</b>}</div>
        </div>
        <span className="espacio" />
        <button className="btn chico" onClick={onEditar}>Editar</button>
        {editable && <BotonAccion clase="btn chico peligro" confirmar={`¿Dar de baja ${equipo.nombre} y su plantel?`} accion={() => api.equipos.eliminar(equipo.id_equipo)} onHecho={onCambio} textoOk="Equipo dado de baja.">Baja</BotonAccion>}
      </div>
      <div className="fila chico" style={{ padding: '10px 16px', gap: 18 }}>
        <span>Jugadores: <b style={{ color: lista.length < 5 ? 'var(--peligro)' : undefined }}>{lista.length}</b> (mín. 5, máx. 10)</span>
        <span>Docentes/funcionarios: <b>{docentes}</b>/2</span>
      </div>
      {lista.length < 5 && <div className="alerta aviso" style={{ margin: '0 16px 10px' }}>Con menos de 5 jugadores el equipo no puede tener partidos programados.</div>}
      <Estado cargando={plantel.cargando} error={plantel.error}>
        <Tabla filas={lista} clave={(j) => j.ci_jugador} vacio="Plantel vacío." columnas={[
          { titulo: 'N°', render: (j) => <b>{j.numero_camiseta}</b> },
          { titulo: 'Jugador', render: (j) => <>{j.nombre} {j.apellido} {j.es_capitan && <span className="chip jugado">C</span>}</> },
          { titulo: 'CI', campo: 'ci_jugador' },
          { titulo: 'Tipo', render: (j) => <Chip valor={j.tipo} clase="" /> },
          { titulo: 'Estado', render: (j) => (j.suspendido_proxima_fecha ? <Chip valor="suspendido" /> : <span className="muted chico">habilitado</span>) },
          {
            titulo: '', acciones: true, render: (j) => <div className="fila" style={{ justifyContent: 'flex-end' }}>
              {!j.es_capitan && <button className="btn chico" onClick={() => hacerCapitan(j.ci_jugador)}>Hacer capitán</button>}
              {editable && <BotonAccion clase="btn chico peligro" confirmar={`¿Quitar a ${j.nombre} ${j.apellido} del plantel?`} accion={() => api.plantel.quitar(equipo.id_equipo, j.ci_jugador)} onHecho={refrescar} textoOk="Jugador quitado.">Quitar</BotonAccion>}
            </div>,
          },
        ]} />
      </Estado>
      {editable ? (
        <form onSubmit={agregar} noValidate style={{ padding: 16, borderTop: '1px solid var(--linea)', display: 'grid', gap: 8 }}>
          <h3>Agregar al plantel</h3>
          {errorAlta && <div className="alerta error">{errorAlta}</div>}
          <div className="fila">
            <select className="control" style={{ flex: 1, minWidth: 220 }} value={nuevo.ci_jugador} onChange={(e) => setNuevo({ ...nuevo, ci_jugador: e.target.value })}>
              <option value="">— Jugador de {equipo.facultad} —</option>
              {disponibles.map((j) => <option key={j.ci} value={j.ci}>{j.apellido}, {j.nombre} · {j.tipo} · {j.ci}</option>)}
            </select>
            <input className="control" type="number" min="1" max="99" placeholder="Camiseta" style={{ width: 110 }} value={nuevo.numero_camiseta} onChange={(e) => setNuevo({ ...nuevo, numero_camiseta: e.target.value })} />
            <button className="btn primario" disabled={lista.length >= 10}>Agregar</button>
          </div>
          <span className="chico muted">Solo se listan jugadores de la facultad del equipo. Si ya integra otro equipo de la edición, el sistema lo rechaza.</span>
        </form>
      ) : <div className="chico muted" style={{ padding: 16, borderTop: '1px solid var(--linea)' }}>El plantel no puede modificarse fuera de la etapa de inscripción.</div>}
    </div>
  );
}
