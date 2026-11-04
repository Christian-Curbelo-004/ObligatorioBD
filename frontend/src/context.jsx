import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, leerSesion, guardarSesion, onSesionVencida } from './api/client.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [sesion, setSesion] = useState(leerSesion);
  const [torneos, setTorneos] = useState([]);
  const [errorTorneos, setErrorTorneos] = useState(null);
  const [idTorneo, setIdTorneo] = useState(() => {
    try { return Number(localStorage.getItem('torneo-ucu-torneo')) || null; } catch { return null; }
  });
  const [toasts, setToasts] = useState([]);

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, texto, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'error' ? 6000 : 3200);
  }, []);

  const salir = useCallback(() => { guardarSesion(null); setSesion(null); }, []);
  useEffect(() => onSesionVencida(() => { salir(); }), [salir]);

  const entrar = async (correo, contrasena) => {
    const s = await api.login(correo, contrasena);
    guardarSesion(s);
    setSesion(s);
  };

  const recargarTorneos = useCallback(async () => {
    if (!leerSesion()) return;
    let lista;
    try { lista = await api.torneos.listar(); setErrorTorneos(null); } catch (e) { setErrorTorneos(e.message); setTorneos([]); return; }
    setTorneos(lista);
    setIdTorneo((actual) => {
      if (lista.some((t) => t.id_torneo === actual)) return actual;
      return (lista.find((t) => t.estado === 'en curso') || lista[0])?.id_torneo ?? null;
    });
  }, []);

  useEffect(() => { if (sesion) recargarTorneos().catch(() => {}); }, [sesion, recargarTorneos]);
  useEffect(() => { try { if (idTorneo) localStorage.setItem('torneo-ucu-torneo', String(idTorneo)); } catch { /* */ } }, [idTorneo]);

  const valor = useMemo(() => ({
    sesion, entrar, salir,
    esAdmin: sesion?.rol === 'administrador',
    torneos, idTorneo, setIdTorneo, recargarTorneos, errorTorneos,
    torneo: torneos.find((t) => t.id_torneo === idTorneo) || null,
    avisar,
  }), [sesion, torneos, idTorneo, recargarTorneos, avisar, salir, errorTorneos]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>)}
      </div>
    </Ctx.Provider>
  );
}
