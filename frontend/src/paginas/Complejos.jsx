import { useState } from 'react';
import { api } from '../api/client.js';
import { BotonAccion, Encabezado, Estado, FormModal, Tabla, useDatos } from '../componentes.jsx';
import { etiqueta, reglas } from '../validacion.js';

const DEPARTAMENTOS = ['Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida', 'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha', 'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'];

export default function Complejos() {
  const complejos = useDatos(() => api.complejos.listar(), []);
  const canchas = useDatos(() => api.canchas.listar(), []);
  const [editComplejo, setEditComplejo] = useState(null);
  const [editCancha, setEditCancha] = useState(null);
  const recargar = () => { complejos.recargar(); canchas.recargar(); };

  return (
    <>
      <Encabezado titulo="Complejos y canchas" subtitulo="Lugares donde se disputan los partidos.">
        <button className="btn" onClick={() => setEditCancha({ superficie: 'sintetico', techada: false })}>+ Nueva cancha</button>
        <button className="btn primario" onClick={() => setEditComplejo({ departamento: 'Montevideo' })}>+ Nuevo complejo</button>
      </Encabezado>
      <Estado cargando={complejos.cargando || canchas.cargando} error={complejos.error || canchas.error}>
        <div className="grilla">
          {complejos.datos?.map((c) => (
            <div className="tarjeta" key={c.id_complejo}>
              <div className="fila" style={{ padding: 16, borderBottom: '1px solid var(--linea)' }}>
                <div><h2>{c.nombre}</h2><div className="chico muted">{c.direccion} · {c.departamento}</div></div>
                <span className="espacio" />
                <button className="btn chico" onClick={() => setEditCancha({ id_complejo: String(c.id_complejo), superficie: 'sintetico', techada: false })}>+ Cancha</button>
                <button className="btn chico" onClick={() => setEditComplejo(c)}>Editar</button>
                <BotonAccion clase="btn chico peligro" confirmar={`¿Eliminar ${c.nombre} y sus canchas?`} accion={() => api.complejos.eliminar(c.id_complejo)} onHecho={recargar} textoOk="Complejo eliminado.">Eliminar</BotonAccion>
              </div>
              <Tabla filas={canchas.datos?.filter((k) => k.id_complejo === c.id_complejo)} clave={(k) => k.nombre_cancha} vacio="Sin canchas cargadas." columnas={[
                { titulo: 'Cancha', render: (k) => <b>{k.nombre_cancha}</b> },
                { titulo: 'Superficie', render: (k) => etiqueta(k.superficie) },
                { titulo: 'Techada', render: (k) => (k.techada ? 'Sí' : 'No') },
                {
                  titulo: '', acciones: true, render: (k) => <div className="fila" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn chico" onClick={() => setEditCancha({ ...k, id_complejo: String(k.id_complejo), existente: true })}>Editar</button>
                    <BotonAccion clase="btn chico peligro" confirmar={`¿Eliminar ${k.nombre_cancha}?`} accion={() => api.canchas.eliminar(k.id_complejo, k.nombre_cancha)} onHecho={recargar} textoOk="Cancha eliminada.">Eliminar</BotonAccion>
                  </div>,
                },
              ]} />
            </div>
          ))}
        </div>
      </Estado>
      {editComplejo && (
        <FormModal titulo={editComplejo.id_complejo ? 'Editar complejo' : 'Nuevo complejo'} inicial={editComplejo} onCerrar={() => setEditComplejo(null)}
          campos={[
            { name: 'nombre', label: 'Nombre', reglas: [reglas.requerido, reglas.max(100)], ancho: true },
            { name: 'direccion', label: 'Dirección', reglas: [reglas.requerido, reglas.max(100)] },
            { name: 'departamento', label: 'Departamento', type: 'select', opciones: DEPARTAMENTOS.map((d) => ({ valor: d, texto: d })), reglas: [reglas.requerido] },
          ]}
          onGuardar={async (v) => {
            const body = { nombre: v.nombre, direccion: v.direccion, departamento: v.departamento };
            if (editComplejo.id_complejo) await api.complejos.modificar(editComplejo.id_complejo, body); else await api.complejos.crear(body);
            recargar();
          }} />
      )}
      {editCancha && (
        <FormModal titulo={editCancha.existente ? `Editar ${editCancha.nombre_cancha}` : 'Nueva cancha'} inicial={editCancha} onCerrar={() => setEditCancha(null)}
          campos={[
            { name: 'id_complejo', label: 'Complejo', type: 'select', opciones: (complejos.datos || []).map((c) => ({ valor: String(c.id_complejo), texto: c.nombre })), reglas: [reglas.requerido], disabled: editCancha.existente },
            { name: 'nombre_cancha', label: 'Nombre de la cancha', reglas: [reglas.requerido, reglas.max(30)], disabled: editCancha.existente, ayuda: editCancha.existente ? 'Es parte de la clave: no se modifica' : 'Único dentro del complejo' },
            { name: 'superficie', label: 'Superficie', type: 'select', opciones: [{ valor: 'sintetico', texto: 'Sintético' }, { valor: 'parquet', texto: 'Parquet' }], reglas: [reglas.requerido] },
            { name: 'techada', label: 'Techada', type: 'checkbox' },
          ]}
          onGuardar={async (v) => {
            if (editCancha.existente) await api.canchas.modificar(editCancha.id_complejo, editCancha.nombre_cancha, { superficie: v.superficie, techada: Boolean(v.techada) });
            else await api.canchas.crear({ nombre_cancha: v.nombre_cancha, id_complejo: Number(v.id_complejo), superficie: v.superficie, techada: Boolean(v.techada) });
            recargar();
          }} />
      )}
    </>
  );
}
