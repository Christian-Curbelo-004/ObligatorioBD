import { useState } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context.jsx';
import { BotonAccion, Chip, Encabezado, Estado, FormModal, Tabla, useDatos } from '../componentes.jsx';
import { ESTADOS_TORNEO, etiqueta, formatoFecha, reglas } from '../validacion.js';

export default function Torneos() {
  const { recargarTorneos } = useApp();
  const { datos, cargando, error, recargar } = useDatos(() => api.torneos.listar(), []);
  const [editando, setEditando] = useState(null);

  const campos = (actual) => [
    { name: 'nombre', label: 'Nombre', reglas: [reglas.requerido, reglas.max(100)], ancho: true },
    { name: 'anio', label: 'Año', type: 'number', reglas: [reglas.requerido, reglas.entero(2000, 2100)] },
    { name: 'semestre', label: 'Semestre', type: 'select', opciones: [{ valor: '1', texto: '1er semestre' }, { valor: '2', texto: '2do semestre' }], reglas: [reglas.requerido] },
    { name: 'fecha_inicio', label: 'Inicio', type: 'date', reglas: [reglas.requerido] },
    {
      name: 'fecha_fin', label: 'Fin', type: 'date',
      reglas: [reglas.requerido, (v, t) => (v && t.fecha_inicio && v < t.fecha_inicio ? 'Anterior al inicio' : null)],
    },
    {
      name: 'estado', label: 'Etapa', type: 'select', reglas: [reglas.requerido],
      opciones: ESTADOS_TORNEO.filter((e) => !actual || ESTADOS_TORNEO.indexOf(e) >= ESTADOS_TORNEO.indexOf(actual.estado)).map((e) => ({ valor: e, texto: etiqueta(e) })),
      ayuda: 'Una edición avanza inscripción → en curso → finalizado. Los planteles solo se editan en inscripción.',
      ancho: true,
    },
  ];
  const listo = () => { recargar(); recargarTorneos(); };

  return (
    <>
      <Encabezado titulo="Torneos" subtitulo="Cada edición corresponde a un semestre.">
        <button className="btn primario" onClick={() => setEditando({ estado: 'inscripcion', anio: String(new Date().getFullYear()) })}>+ Nueva edición</button>
      </Encabezado>
      <div className="tarjeta">
        <Estado cargando={cargando} error={error}>
          <Tabla filas={datos} clave={(t) => t.id_torneo} columnas={[
            { titulo: 'Nombre', campo: 'nombre' },
            { titulo: 'Edición', render: (t) => `${t.anio}-${t.semestre}` },
            { titulo: 'Período', render: (t) => `${formatoFecha(t.fecha_inicio)} – ${formatoFecha(t.fecha_fin)}` },
            { titulo: 'Etapa', render: (t) => <Chip valor={t.estado} /> },
            {
              titulo: '', acciones: true, render: (t) => <div className="fila" style={{ justifyContent: 'flex-end' }}>
                <button className="btn chico" onClick={() => setEditando({ ...t, anio: String(t.anio), semestre: String(t.semestre) })}>Editar</button>
                <BotonAccion clase="btn chico peligro" confirmar={`¿Eliminar ${t.nombre}?`} accion={() => api.torneos.eliminar(t.id_torneo)} onHecho={listo} textoOk="Torneo eliminado.">Eliminar</BotonAccion>
              </div>,
            },
          ]} />
        </Estado>
      </div>
      {editando && (
        <FormModal
          titulo={editando.id_torneo ? 'Editar edición' : 'Nueva edición'}
          campos={campos(editando.id_torneo ? datos.find((t) => t.id_torneo === editando.id_torneo) : null)}
          inicial={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={async (v) => {
            const body = { ...v, anio: Number(v.anio), semestre: Number(v.semestre) };
            if (editando.id_torneo) await api.torneos.modificar(editando.id_torneo, body); else await api.torneos.crear(body);
            listo();
          }}
        />
      )}
    </>
  );
}
