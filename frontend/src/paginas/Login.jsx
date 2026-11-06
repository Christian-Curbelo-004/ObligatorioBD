import { useState } from 'react';
import { useApp } from '../context.jsx';
import { USE_MOCK } from '../api/client.js';
import { RE_EMAIL } from '../validacion.js';

export default function Login() {
  const { entrar } = useApp();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    if (!RE_EMAIL.test(correo)) return setError('Ingresá un correo válido.');
    if (contrasena.length < 4) return setError('Ingresá tu contraseña.');
    setEnviando(true); setError(null);
    try { await entrar(correo.trim(), contrasena); } catch (err) { setError(err.message); } finally { setEnviando(false); }
  };
  const usar = (c, p) => { setCorreo(c); setContrasena(p); };

  return (
    <div className="login">
      <section className="cancha">
        <div className="marca"><div className="pelota">F5</div><div><b>Interfacultades</b><small>Universidad Católica del Uruguay</small></div></div>
        <div>
          <h1>Torneo Interfacultades de Fútbol 5</h1>
          <p>Fixture, planillas, sanciones y tabla de posiciones de cada edición, en un solo lugar.</p>
        </div>
        <small style={{ opacity: .6, position: 'relative' }}>Base de Datos 1 · 2026</small>
      </section>
      <section className="lado">
        <form onSubmit={enviar} noValidate>
          <h2>Ingresar</h2>
          {error && <div className="alerta error">{error}</div>}
          <label className="campo"><span>Correo</span>
            <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} autoFocus />
          </label>
          <label className="campo"><span>Contraseña</span>
            <input type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
          </label>
          <button className="btn primario" disabled={enviando} style={{ justifyContent: 'center', padding: '10px' }}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
          {USE_MOCK && (
            <div className="demo">
              Modo demo. Usuarios de prueba:<br />
              <button type="button" onClick={() => usar('admin@ucu.edu.uy', 'admin123')}>admin@ucu.edu.uy / admin123</button> (administrador)<br />
              <button type="button" onClick={() => usar('planillero@ucu.edu.uy', 'plan123')}>planillero@ucu.edu.uy / plan123</button> (planillero)
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
