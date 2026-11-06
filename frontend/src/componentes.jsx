import { useCallback, useEffect, useState } from 'react';
import { validar, etiqueta } from './validacion.js';
import { useApp } from './context.jsx';

// Carga datos de la API con estado de carga/error y función para recargar
export function useDatos(fn, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDatos(await fn()); setError(null); } catch (e) { setError(e); } finally { setCargando(false); }
  }, deps);
  useEffect(() => { cargar(); }, [cargar]);
  return { datos, error, cargando, recargar: cargar, setDatos };
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div className="encabezado">
      <div><h1>{titulo}</h1>{subtitulo && <p>{subtitulo}</p>}</div>
      <div className="fila">{children}</div>
    </div>
  );
}

export function Estado({ cargando, error, vacio, children, textoVacio = 'No hay registros.' }) {
  if (error) return <div className="alerta error">{error.message}</div>;
  if (cargando) return <div className="vacio">Cargando…</div>;
  if (vacio) return <div className="vacio">{textoVacio}</div>;
  return children;
}

export function Chip({ valor, clase }) {
  return <span className={`chip ${clase ?? String(valor).replace(/\s/g, '')}`}>{etiqueta(valor)}</span>;
}

export function Modal({ titulo, onCerrar, children, pie, ancho }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);
  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined}>
        <header><h2>{titulo}</h2><button className="btn fantasma" onClick={onCerrar} aria-label="Cerrar">✕</button></header>
        <div className="cuerpo">{children}</div>
        {pie && <footer>{pie}</footer>}
      </div>
    </div>
  );
}

export function Campo({ campo, valor, error, onChange }) {
  const { name, label, type = 'text', opciones, ayuda, disabled, placeholder, min, max } = campo;
  let control;
  if (type === 'select') {
    control = (
      <select value={valor ?? ''} disabled={disabled} onChange={(e) => onChange(name, e.target.value)}>
        <option value="">— Elegir —</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    );
  } else if (type === 'checkbox') {
    return (
      <label className={`check ${campo.ancho ? 'ancho' : ''}`}>
        <input type="checkbox" checked={Boolean(valor)} disabled={disabled} onChange={(e) => onChange(name, e.target.checked)} />
        {label}
      </label>
    );
  } else if (type === 'textarea') {
    control = <textarea rows={3} value={valor ?? ''} disabled={disabled} onChange={(e) => onChange(name, e.target.value)} />;
  } else {
    control = (
      <input type={type} value={valor ?? ''} disabled={disabled} placeholder={placeholder} min={min} max={max}
        inputMode={campo.inputMode} onChange={(e) => onChange(name, e.target.value)} />
    );
  }
  return (
    <label className={`campo ${error ? 'error' : ''} ${campo.ancho ? 'ancho' : ''}`}>
      <span>{label}</span>
      {control}
      {error ? <span className="msg">{error}</span> : ayuda && <span className="ayuda">{ayuda}</span>}
    </label>
  );
}

// Formulario genérico en modal. Valida en el cliente con `campos[].reglas`
// y muestra los errores que devuelva el servidor (mensaje + errores por campo).
export function FormModal({ titulo, campos, inicial, onGuardar, onCerrar, textoGuardar = 'Guardar' }) {
  const [valores, setValores] = useState(inicial || {});
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const { avisar } = useApp();

  const cambiar = (name, v) => {
    setValores((x) => ({ ...x, [name]: v }));
    setErrores((x) => ({ ...x, [name]: undefined }));
  };
  const enviar = async (e) => {
    e?.preventDefault();
    const esquema = Object.fromEntries(campos.filter((c) => c.reglas).map((c) => [c.name, c.reglas]));
    const errs = validar(valores, esquema);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setEnviando(true); setErrorGeneral(null);
    try {
      await onGuardar(valores);
      avisar('Guardado.');
      onCerrar();
    } catch (err) {
      setErrorGeneral(err.message);
      if (err.campos) setErrores(err.campos);
    } finally { setEnviando(false); }
  };
  return (
    <Modal titulo={titulo} onCerrar={onCerrar} pie={<>
      <button className="btn" onClick={onCerrar}>Cancelar</button>
      <button className="btn primario" onClick={enviar} disabled={enviando}>{enviando ? 'Guardando…' : textoGuardar}</button>
    </>}>
      <form className="form" onSubmit={enviar} noValidate>
        {errorGeneral && <div className="alerta error ancho">{errorGeneral}</div>}
        {campos.filter((c) => !c.oculto).map((c) => (
          <Campo key={c.name} campo={c} valor={valores[c.name]} error={errores[c.name]} onChange={cambiar} />
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// Botón que pide confirmación y ejecuta una acción contra la API
export function BotonAccion({ children, confirmar, accion, onHecho, clase = 'btn chico', textoOk }) {
  const { avisar } = useApp();
  const [ocupado, setOcupado] = useState(false);
  const click = async () => {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    try {
      await accion();
      if (textoOk) avisar(textoOk);
      onHecho?.();
    } catch (e) { avisar(e.message, 'error'); } finally { setOcupado(false); }
  };
  return <button className={clase} onClick={click} disabled={ocupado}>{children}</button>;
}

export function Tabla({ columnas, filas, clave, destacar, vacio = 'No hay registros.' }) {
  if (!filas?.length) return <div className="vacio">{vacio}</div>;
  return (
    <div className="tabla-scroll">
      <table className="tabla">
        <thead><tr>{columnas.map((c) => <th key={c.titulo} className={c.num ? 'num' : c.acciones ? 'acciones' : ''}>{c.titulo}</th>)}</tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={clave ? clave(f) : i} className={destacar?.(f, i) ? 'destacada' : ''}>
              {columnas.map((c) => (
                <td key={c.titulo} className={c.num ? 'num' : c.acciones ? 'acciones' : ''}>{c.render ? c.render(f) : f[c.campo]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SinTorneo() {
  return <div className="tarjeta relleno vacio">No hay ninguna edición del torneo. Creá una en <b>Torneos</b>.</div>;
}
