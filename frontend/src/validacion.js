export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const RE_CI = /^\d{7,8}$/;
export const hoyISO = () => new Date().toISOString().slice(0, 10);

export const reglas = {
  requerido: (v) => (v === undefined || v === null || String(v).trim() === '' ? 'Obligatorio' : null),
  ci: (v) => (v && !RE_CI.test(String(v)) ? '7 u 8 dígitos, sin puntos ni guiones' : null),
  email: (v) => (v && !RE_EMAIL.test(v) ? 'Email inválido' : null),
  max: (n) => (v) => (v && String(v).length > n ? `Máximo ${n} caracteres` : null),
  entero: (min, max) => (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    if (!Number.isInteger(n)) return 'Debe ser un número entero';
    if (n < min || n > max) return `Entre ${min} y ${max}`;
    return null;
  },
  pasado: (v) => (v && v >= hoyISO() ? 'Debe ser anterior a hoy' : null),
  soloLetras: (v) => (v && !/^[\p{L}\s'.-]+$/u.test(v) ? 'Solo letras' : null),
};

// esquema: { campo: [regla, regla, ...] }  ->  { campo: 'mensaje' }
export function validar(valores, esquema) {
  const errores = {};
  for (const [campo, lista] of Object.entries(esquema)) {
    for (const r of lista) {
      const m = r(valores[campo], valores);
      if (m) { errores[campo] = m; break; }
    }
  }
  return errores;
}

export const TIPOS_JUGADOR = ['grado', 'posgrado', 'docente', 'funcionario'];
const ETIQUETAS = { inscripcion: 'inscripción', 'acumulacion de amarillas': 'acumulación de amarillas', sintetico: 'sintético' };
export const etiqueta = (v) => ETIQUETAS[v] ?? v;
// MySQL devuelve TIME como 'HH:MM:SS'
export const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export const ESTADOS_TORNEO = ['inscripcion', 'en curso', 'finalizado'];
export const ESTADOS_PARTIDO = ['programado', 'jugado', 'postergado', 'cancelado'];

export const formatoFecha = (iso) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
export const diaSemana = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-UY', { weekday: 'short', day: '2-digit', month: 'short' });
