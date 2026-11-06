# Frontend — Torneo Interfacultades de Fútbol 5 (UCU)

Aplicación web en **React + Vite** para el obligatorio de Base de Datos 1
(2do semestre 2026). Cubre todos los requerimientos funcionales de la letra:

- Login con dos roles: **administrador** (todo) y **planillero** (solo planillas, goles y tarjetas).
- ABM de jugadores, equipos y planteles, complejos y canchas, partidos, sanciones y ediciones del torneo.
- Registro de planilla de juego, goles (con autogol) y tarjetas, con el resultado calculado a partir de los goles.
- Los 9 reportes pedidos + 3 extra (partidos sin perder, fecha con más goles, equipos sin sanciones).

Se conecta al backend Flask de la carpeta `backend/`.

## Correr en local

Requisitos: **Node.js 18 o superior** (`node -v`), y para usar datos reales, la base
(MySQL con `docker-compose up`) y el backend Flask corriendo en el puerto 5000.

```bash
cd frontend
npm install
copy .env.example .env      # en Windows (en Mac/Linux: cp .env.example .env)
npm run dev
```

Abrir http://localhost:5173

El front llama a `/api/...` y Vite reenvía esos pedidos al backend
(`BACKEND_URL`, por defecto `http://localhost:5000`). Así el navegador ve un solo
origen y no hace falta configurar CORS en Flask.

### Backend real o modo demo

En `.env` (después de cambiarlo, reiniciar `npm run dev`):

| Variable | Valor | Efecto |
|---|---|---|
| `VITE_USE_MOCK` | `false` | Usa el backend Flask (por defecto). |
| `VITE_USE_MOCK` | `true` | Modo demo: datos de prueba en el navegador, sin backend ni base. |
| `BACKEND_URL` | `http://localhost:5000` | Dónde corre Flask. |

Usuarios de prueba:

| Correo | Contraseña | Rol |
|---|---|---|
| admin@ucu.edu.uy | admin123 | administrador |
| planillero@ucu.edu.uy | plan123 | planillero |

El modo demo usa los mismos datos base que `db/init/04_datos_prueba.sql`
(facultades, equipos, los 42 jugadores con sus camisetas, complejos y canchas),
más una edición 2027 en inscripción para probar los planteles. El fixture y los
goles se generan con fechas relativas a hoy, así siempre hay partidos recientes
para probar la carga de planillas. El botón **reiniciar** de la barra superior
vuelve a los datos originales.

### Con Docker

El front se sirve con nginx, que además reenvía `/api` al backend. En el
`docker-compose.yml` del proyecto:

```yaml
  frontend:
    build: ./frontend
    environment:
      BACKEND_URL: http://backend:5000   # nombre del servicio del backend
    ports:
      - "5173:80"
    depends_on:
      - backend
```

(No se probó acá porque no hay Docker disponible: confirmarlo al armar el compose.)

## Conexión con el backend

- `src/api/client.js` hace los pedidos HTTP y elige entre backend real y modo demo.
- `src/api/backend.js` adapta las respuestas del backend a lo que usan las
  pantallas: convierte fechas, completa nombres de equipos, horarios y
  resultados, y transforma los reportes.
- Lo que el backend no permite (borrar goles/tarjetas, corregir la lista de la
  planilla) se oculta en la interfaz mediante `CAPACIDADES` en `client.js`.
- `API.md` fue la propuesta inicial de contrato. El backend no la siguió, y la
  adaptación quedó en `backend.js`.

## Estructura

```
frontend/
├── API.md                  propuesta de contrato inicial
├── Dockerfile, nginx.conf  imagen de producción
└── src/
    ├── api/client.js       fetch + token; elige mock o backend real
    ├── api/backend.js      adaptador al backend Flask
    ├── mock/               servidor simulado: seed.js, reglas.js, server.js, reportes.js
    ├── context.jsx         sesión, rol, edición seleccionada, avisos
    ├── componentes.jsx     tabla, modal, formulario genérico con validación
    ├── validacion.js       reglas de validación del lado cliente
    └── paginas/            una pantalla por sección
```

## Decisiones (para el informe)

- **Validación en tres capas.** El front valida formato y reglas que puede
  verificar con lo que ya tiene cargado (CI, email, fechas, equipo que ya juega esa
  fecha, cancha ocupada, cupo de docentes, camiseta repetida) para dar respuesta
  inmediata. El backend y la base vuelven a validar todo; el front muestra el
  mensaje del servidor y marca el campo si viene en `campos`.
- **Permisos por rol en la interfaz.** El planillero solo ve *Partidos y
  planillas*; las rutas de administración redirigen. Esto es comodidad: la
  seguridad real está en el backend (403) y en los usuarios de MySQL.
- **Sanciones automáticas.** No se cargan a mano: las genera la base (trigger)
  al registrar una roja o la 3.ª amarilla. Por ABM solo se crean disciplinarias.
- **Equipo sin capitán al crearlo.** El capitán tiene que ser del plantel, y al
  inscribir el equipo el plantel está vacío; se elige después con *Hacer capitán*.
- **Ventana de corrección de 48 h.** La planilla de un partido jugado se puede
  editar hasta 48 h después del fin del turno; después queda en solo lectura.
- **Planilla en dos pasos.** Primero se marcan los jugadores que jugaron y se
  guarda (el partido queda como jugado); después se cargan goles y tarjetas.
- **Sin CORS.** El front y la API se sirven desde el mismo origen gracias al
  proxy (Vite en desarrollo, nginx en Docker).
