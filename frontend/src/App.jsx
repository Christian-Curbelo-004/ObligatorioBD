import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './context.jsx';
import { USE_MOCK } from './api/client.js';
import Login from './paginas/Login.jsx';
import Inicio from './paginas/Inicio.jsx';
import Torneos from './paginas/Torneos.jsx';
import Jugadores from './paginas/Jugadores.jsx';
import Equipos from './paginas/Equipos.jsx';
import Complejos from './paginas/Complejos.jsx';
import Partidos from './paginas/Partidos.jsx';
import Planilla from './paginas/Planilla.jsx';
import Sanciones from './paginas/Sanciones.jsx';
import Reportes from './paginas/Reportes.jsx';

function SoloAdmin({ children }) {
  const { esAdmin } = useApp();
  return esAdmin ? children : <Navigate to="/partidos" replace />;
}

export default function App() {
  const { sesion, esAdmin, salir, torneos, idTorneo, setIdTorneo, errorTorneos } = useApp();
  if (!sesion) return <Login />;

  const reiniciar = async () => {
    if (!window.confirm('¿Volver a cargar los datos de prueba originales? Se pierden los cambios hechos en modo demo.')) return;
    const { reiniciarMock } = await import('./mock/server.js');
    reiniciarMock();
    window.location.reload();
  };

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <div className="pelota">F5</div>
          <div><b>Interfacultades</b><small>UCU · Fútbol 5</small></div>
        </div>
        <nav className="nav">
          {esAdmin && <NavLink to="/" end>Inicio</NavLink>}
          <NavLink to="/partidos">Partidos y planillas</NavLink>
          {esAdmin && <>
            <div className="seccion">Gestión</div>
            <NavLink to="/equipos">Equipos y planteles</NavLink>
            <NavLink to="/jugadores">Jugadores</NavLink>
            <NavLink to="/sanciones">Sanciones</NavLink>
            <NavLink to="/complejos">Complejos y canchas</NavLink>
            <NavLink to="/torneos">Torneos</NavLink>
            <div className="seccion">Análisis</div>
            <NavLink to="/reportes">Reportes</NavLink>
          </>}
        </nav>
        <div className="pie">
          <span className="rol">{sesion.rol}</span>
          <span style={{ wordBreak: 'break-all' }}>{sesion.correo}</span>
          <button onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="principal">
        <div className="barra">
          <label>
            Edición
            <select className="control" value={idTorneo ?? ''} onChange={(e) => setIdTorneo(Number(e.target.value))}>
              {torneos.map((t) => <option key={t.id_torneo} value={t.id_torneo}>{t.nombre} · {t.anio}-{t.semestre} ({t.estado === 'inscripcion' ? 'inscripción' : t.estado})</option>)}
            </select>
          </label>
          {USE_MOCK && <span className="mock-aviso">Modo demo: datos de prueba locales <button onClick={reiniciar}>reiniciar</button></span>}
        </div>
        <main className="contenido">
          {errorTorneos && <div className="alerta error" style={{ marginBottom: 16 }}>No se pudieron cargar las ediciones del torneo: {errorTorneos}</div>}
          <Routes>
            <Route path="/" element={esAdmin ? <Inicio /> : <Navigate to="/partidos" replace />} />
            <Route path="/partidos" element={<Partidos />} />
            <Route path="/partidos/:id/planilla" element={<Planilla />} />
            <Route path="/equipos" element={<SoloAdmin><Equipos /></SoloAdmin>} />
            <Route path="/jugadores" element={<SoloAdmin><Jugadores /></SoloAdmin>} />
            <Route path="/sanciones" element={<SoloAdmin><Sanciones /></SoloAdmin>} />
            <Route path="/complejos" element={<SoloAdmin><Complejos /></SoloAdmin>} />
            <Route path="/torneos" element={<SoloAdmin><Torneos /></SoloAdmin>} />
            <Route path="/reportes" element={<SoloAdmin><Reportes /></SoloAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
