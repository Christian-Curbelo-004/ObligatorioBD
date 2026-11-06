import { useState } from 'react';
import { api, CAPACIDADES } from '../api/client.js';
import { useApp } from '../context.jsx';
import { BotonAccion, Chip, Encabezado, Estado, FormModal, Tabla, useDatos, SinTorneo } from '../componentes.jsx';
import { etiqueta, reglas } from '../validacion.js';

export default function Sanciones() {
  const { idTorneo } = useApp();
  const { datos, cargando, error, recargar } = useDatos(async () => {
    if (!idTorneo) return null;
    const [sanciones, equipos] = await Promise.all([api.sanciones.listar({ id_torneo: idTorneo }), api.equipos.listar({ id_torneo: idTorneo })]);
    const planteles = await Promise.all(equipos.map((e) => api.plantel.listar(e.id_equipo).then((p) => p.map((j) => ({ ...j, equipo: e.nombre })))));
    return { sanciones, jugadores: planteles.flat() };
  }, [idTorneo]);
  const [editando, setEditando] = useState(null);

  if (!idTorneo) return <SinTorneo />;
  const fechas = (s) => (s.cantidad_fechas === 1 ? `Fecha ${s.numero_fecha_inicio}` : `Fechas ${s.numero_fecha_inicio} a ${s.numero_fecha_inicio + s.cantidad_fechas - 1}`);

  return (
    <>
      <Encabezado titulo="Sanciones" subtitulo="Las sanciones por roja y por 3 amarillas se generan solas al cargar las tarjetas. Acá se cargan las disciplinarias.">
        <button className="btn primario" onClick={() => setEditando({ cantidad_fechas: '1' })}>+ Sanción disciplinaria</button>
      </Encabezado>
      <div className="tarjeta">
        <Estado cargando={cargando} error={error}>
          <Tabla filas={datos?.sanciones} clave={(s) => s.id_sancion} vacio="No hay sanciones en esta edición." columnas={[
            { titulo: 'Jugador', render: (s) => <><b>{s.jugador}</b><div className="chico muted">{s.equipo}</div></> },
            { titulo: 'Motivo', render: (s) => <span className={`chip ${s.motivo === 'roja' ? 'cancelado' : s.motivo === 'disciplinaria' ? '' : 'postergado'}`}>{etiqueta(s.motivo)}</span> },
            { titulo: 'Cumple', render: (s) => fechas(s) },
            { titulo: 'Detalle', render: (s) => <span className="chico">{s.id_tarjeta_origen ? `Por la tarjeta #${s.id_tarjeta_origen}` : 'Cargada por la organización'}</span> },
            { titulo: 'Origen', render: (s) => (s.automatica ? <Chip valor="automática" clase="programado" /> : <Chip valor="organización" clase="" />) },
            {
              titulo: '', acciones: true, render: (s) => (s.automatica ? <span className="chico muted">{CAPACIDADES.borrarEventos ? 'se corrige borrando la tarjeta' : 'la genera la base'}</span> : (
                <div className="fila" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn chico" onClick={() => setEditando({ ...s, numero_fecha_inicio: String(s.numero_fecha_inicio), cantidad_fechas: String(s.cantidad_fechas) })}>Editar</button>
                  <BotonAccion clase="btn chico peligro" confirmar="¿Eliminar la sanción?" accion={() => api.sanciones.eliminar(s.id_sancion)} onHecho={recargar} textoOk="Sanción eliminada.">Eliminar</BotonAccion>
                </div>
              )),
            },
          ]} />
        </Estado>
      </div>
      {editando && datos && (
        <FormModal titulo={editando.id_sancion ? 'Editar sanción disciplinaria' : 'Nueva sanción disciplinaria'} inicial={editando} onCerrar={() => setEditando(null)}
          campos={[
            {
              name: 'ci_jugador', label: 'Jugador', type: 'select', ancho: true, reglas: [reglas.requerido], disabled: Boolean(editando.id_sancion),
              opciones: datos.jugadores.map((j) => ({ valor: j.ci_jugador, texto: `${j.apellido}, ${j.nombre} — ${j.equipo}` })).sort((a, b) => a.texto.localeCompare(b.texto)),
            },
            { name: 'numero_fecha_inicio', label: 'Desde la fecha', type: 'number', min: 1, reglas: [reglas.requerido, reglas.entero(1, 50)] },
            { name: 'cantidad_fechas', label: 'Cantidad de fechas', type: 'number', min: 1, reglas: [reglas.requerido, reglas.entero(1, 20)] },
          ]}
          onGuardar={async (v) => {
            const body = { ci_jugador: v.ci_jugador, id_torneo: idTorneo, motivo: 'disciplinaria', numero_fecha_inicio: Number(v.numero_fecha_inicio), cantidad_fechas: Number(v.cantidad_fechas) };
            if (editando.id_sancion) await api.sanciones.modificar(editando.id_sancion, body); else await api.sanciones.crear(body);
            recargar();
          }} />
      )}
    </>
  );
}
