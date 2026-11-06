import { useState } from 'react';
import { api } from '../api/client.js';
import { BotonAccion, Chip, Encabezado, Estado, FormModal, Tabla, useDatos } from '../componentes.jsx';
import { TIPOS_JUGADOR, formatoFecha, reglas } from '../validacion.js';

export default function Jugadores() {
  const [filtros, setFiltros] = useState({ q: '', id_facultad: '', tipo: '' });
  const facultades = useDatos(() => api.facultades(), []);
  const { datos, cargando, error, recargar } = useDatos(() => api.jugadores.listar(filtros), [filtros.q, filtros.id_facultad, filtros.tipo]);
  const [editando, setEditando] = useState(null);

  const opcFac = (facultades.datos || []).map((f) => ({ valor: String(f.id_facultad), texto: f.nombre }));
  const campos = [
    { name: 'ci', label: 'Cédula', reglas: [reglas.requerido, reglas.ci], disabled: Boolean(editando?.existente), inputMode: 'numeric', placeholder: '12345678' },
    { name: 'tipo', label: 'Tipo', type: 'select', opciones: TIPOS_JUGADOR.map((t) => ({ valor: t, texto: t })), reglas: [reglas.requerido], ayuda: 'Máx. 2 docentes/funcionarios por plantel' },
    { name: 'nombre', label: 'Nombre', reglas: [reglas.requerido, reglas.soloLetras, reglas.max(100)] },
    { name: 'apellido', label: 'Apellido', reglas: [reglas.requerido, reglas.soloLetras, reglas.max(100)] },
    { name: 'email', label: 'Email', type: 'email', reglas: [reglas.requerido, reglas.email, reglas.max(120)] },
    { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', reglas: [reglas.requerido, reglas.pasado] },
    { name: 'id_facultad', label: 'Facultad', type: 'select', opciones: opcFac, reglas: [reglas.requerido], ancho: true },
  ];

  return (
    <>
      <Encabezado titulo="Jugadores" subtitulo="Estudiantes, docentes y funcionarios habilitados para inscribirse.">
        <button className="btn primario" onClick={() => setEditando({})}>+ Nuevo jugador</button>
      </Encabezado>
      <div className="tarjeta">
        <div className="fila" style={{ padding: 14, borderBottom: '1px solid var(--linea)' }}>
          <input className="control" placeholder="Buscar por nombre, CI o email" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
          <select className="control" value={filtros.id_facultad} onChange={(e) => setFiltros({ ...filtros, id_facultad: e.target.value })}>
            <option value="">Todas las facultades</option>
            {opcFac.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
          <select className="control" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
            <option value="">Todos los tipos</option>
            {TIPOS_JUGADOR.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Estado cargando={cargando} error={error}>
          <Tabla filas={datos} clave={(j) => j.ci} vacio="No hay jugadores con esos filtros." columnas={[
            { titulo: 'CI', campo: 'ci' },
            { titulo: 'Nombre', render: (j) => <><b>{j.apellido}</b>, {j.nombre}<div className="chico muted">{j.email}</div></> },
            { titulo: 'Facultad', campo: 'facultad' },
            { titulo: 'Tipo', render: (j) => <Chip valor={j.tipo} clase="" /> },
            { titulo: 'Nacimiento', render: (j) => formatoFecha(j.fecha_nacimiento) },
            {
              titulo: '', acciones: true, render: (j) => <div className="fila" style={{ justifyContent: 'flex-end' }}>
                <button className="btn chico" onClick={() => setEditando({ ...j, id_facultad: String(j.id_facultad), existente: true })}>Editar</button>
                <BotonAccion clase="btn chico peligro" confirmar={`¿Dar de baja a ${j.nombre} ${j.apellido}?`} accion={() => api.jugadores.eliminar(j.ci)} onHecho={recargar} textoOk="Jugador eliminado.">Baja</BotonAccion>
              </div>,
            },
          ]} />
        </Estado>
      </div>
      {editando && (
        <FormModal
          titulo={editando.existente ? `Editar ${editando.nombre} ${editando.apellido}` : 'Nuevo jugador'}
          campos={campos} inicial={editando} onCerrar={() => setEditando(null)}
          onGuardar={async (v) => {
            const body = { ...v, id_facultad: Number(v.id_facultad) };
            delete body.existente; delete body.facultad;
            if (editando.existente) await api.jugadores.modificar(editando.ci, body); else await api.jugadores.crear(body);
            recargar();
          }}
        />
      )}
    </>
  );
}
