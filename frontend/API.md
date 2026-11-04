# Contrato de la API (propuesta inicial)

> El front se adapta al backend real en `src/api/backend.js`. Este documento
> describe las rutas que implementa el modo demo.

Este documento es lo que el frontend espera del backend en Python. El modo demo
(`VITE_USE_MOCK=true`) implementa exactamente estas rutas y reglas en
`src/mock/server.js`, así que sirve de referencia ejecutable: si algo no queda claro
acá, mirá cómo lo resuelve el mock.

## Convenciones

- Base: `http://localhost:5000/api` (configurable con `VITE_API_URL`).
- JSON en request y response. Nombres de campo = nombres de columna de la letra.
- Autenticación: `POST /auth/login` devuelve un `token`; el front lo manda en cada
  request como `Authorization: Bearer <token>`.
- El backend debe habilitar **CORS** para `http://localhost:5173` (con Flask:
  `flask-cors`).
- Fechas `YYYY-MM-DD`. Horas: `HH:MM` o `HH:MM:SS` (el front usa los primeros 5 caracteres). `techada` y `autogol` son booleanos.
- Los valores ENUM son **los de `db/init/01_schema.sql`, sin tilde**: `inscripcion`, `acumulacion de amarillas`, `sintetico`. El front agrega las tildes solo al mostrarlos.
- Ojo con `DATE` y `TIME` en Flask: `jsonify` los convierte a formato raro (`Tue, 07 Oct 2026 00:00:00 GMT`, `timedelta`). Convertirlos a texto con `.isoformat()` / `str()` antes de devolverlos.

### Errores

Cualquier error responde con código HTTP y este cuerpo:

```json
{ "error": "Mensaje para mostrar al usuario", "campos": { "ci": "Formato inválido" } }
```

`campos` es opcional: si viene, el front marca en rojo esos campos del formulario.

| Código | Cuándo |
|---|---|
| 400 | Dato con formato inválido o faltante |
| 401 | Sin token o token vencido (el front vuelve al login) |
| 403 | El rol no tiene permiso (planillero intentando un ABM) |
| 404 | No existe el recurso |
| 409 | Viola una regla del negocio (ej. "ya juega en la fecha 3") |

## Roles

| Rol | Puede |
|---|---|
| `administrador` | Todo |
| `planillero` | Todos los `GET`, más: `PUT /partidos/:id/planilla`, `POST /partidos/:id/goles`, `POST /partidos/:id/tarjetas`, `DELETE /goles/:id`, `DELETE /tarjetas/:id`, `PATCH /partidos/:id/estado` **solo** con `{"estado":"jugado"}` |

Sugerencia para la base: dos usuarios MySQL (`app_admin` y `app_planillero`) y que
el backend use la conexión del rol del usuario logueado. A `app_planillero` darle
`SELECT` en todo e `INSERT, UPDATE, DELETE` solo en `planilla_partido`, `gol`,
`tarjeta` (y `UPDATE (estado)` en `partido`, `INSERT` en `sancion_jugador` si las
automáticas se generan por trigger).

---

## Endpoints

### Auth y catálogos

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/auth/login` | `{correo, contrasena}` | `{token, correo, rol}` |
| GET | `/facultades` | | `[{id_facultad, nombre}]` |
| GET | `/turnos` | | `[{id_turno, hora_inicio, hora_fin}]` (18:00 a 23:00) |

### Torneos

| Método | Ruta | Notas |
|---|---|---|
| GET | `/torneos` | Ordenados del más nuevo al más viejo |
| POST | `/torneos` | `{nombre, anio, semestre, fecha_inicio, fecha_fin, estado}` |
| PUT | `/torneos/:id` | Igual que POST. El estado solo avanza: inscripción → en curso → finalizado |
| DELETE | `/torneos/:id` | 409 si tiene equipos |

### Jugadores

| Método | Ruta | Notas |
|---|---|---|
| GET | `/jugadores?q=&id_facultad=&tipo=` | Agregar `facultad` (nombre) en cada fila |
| POST | `/jugadores` | `{ci, nombre, apellido, email, fecha_nacimiento, id_facultad, tipo}` |
| PUT | `/jugadores/:ci` | Mismo body; la CI no cambia |
| DELETE | `/jugadores/:ci` | 409 si figura en planillas, planteles o es capitán |

Validaciones: CI 7-8 dígitos, email válido y único, nacimiento anterior a hoy,
`tipo ∈ {grado, posgrado, docente, funcionario}`.

### Equipos y planteles

| Método | Ruta | Notas |
|---|---|---|
| GET | `/equipos?id_torneo=` | Cada fila agrega `facultad`, `capitan` (nombre) y `cantidad_jugadores` |
| GET | `/equipos/:id` | |
| POST | `/equipos` | `{nombre, id_torneo, id_facultad}`. Solo si el torneo está en inscripción. Se crea sin capitán |
| PUT | `/equipos/:id` | `{nombre, id_facultad?, ci_capitan}`. El capitán debe estar en el plantel |
| DELETE | `/equipos/:id` | Solo en inscripción y sin partidos |
| GET | `/equipos/:id/plantel` | `[{ci_jugador, numero_camiseta, nombre, apellido, tipo, es_capitan, suspendido_proxima_fecha}]` |
| POST | `/equipos/:id/plantel` | `{ci_jugador, numero_camiseta}` |
| PUT | `/equipos/:id/plantel/:ci` | `{numero_camiseta}` |
| DELETE | `/equipos/:id/plantel/:ci` | 409 si es el capitán |

Reglas del plantel (409 si no se cumplen): torneo en **inscripción**; máximo 10
jugadores; el jugador es de la **misma facultad** del equipo; no integra **otro
equipo de la misma edición**; máximo **2 docentes/funcionarios**; camiseta 1-99 sin
repetir en el equipo.

### Complejos y canchas

| Método | Ruta | Notas |
|---|---|---|
| GET | `/complejos` | Agrega `cantidad_canchas` |
| POST / PUT / DELETE | `/complejos`, `/complejos/:id` | `{nombre, direccion, departamento}` |
| GET | `/canchas?id_complejo=` | Agrega `complejo` (nombre) |
| POST | `/canchas` | `{nombre_cancha, id_complejo, superficie, techada}` |
| PUT | `/complejos/:id/canchas/:nombre` | `{superficie, techada}` (la clave no cambia) |
| DELETE | `/complejos/:id/canchas/:nombre` | 409 si tiene partidos |

### Partidos

| Método | Ruta | Notas |
|---|---|---|
| GET | `/partidos?id_torneo=&numero_fecha=&estado=` | Ver campos extra abajo |
| GET | `/partidos/:id` | |
| POST | `/partidos` | `{id_torneo, numero_fecha, id_equipo_local, id_equipo_visitante, dia, id_turno, nombre_cancha, id_complejo}` → estado `programado` |
| PUT | `/partidos/:id` | Mismo body + `estado`. 409 si ya está jugado |
| PATCH | `/partidos/:id/estado` | `{estado}` |
| DELETE | `/partidos/:id` | 409 si está jugado |

Campos que el front espera en cada partido además de las columnas:
`equipo_local`, `equipo_visitante`, `hora_inicio`, `hora_fin`, `complejo`,
`goles_local`, `goles_visitante` (null si no está jugado),
`horario_cumplido` (bool: ya pasó día y turno), `corregible_hasta` (ISO: fin + 48 h).

Reglas al programar o editar (409): ambos equipos de la edición y con ≥ 5
jugadores; local ≠ visitante; no tienen otro partido entre sí en la edición salvo
cancelado; ningún equipo juega dos veces la misma fecha; la cancha no tiene otro
partido el mismo día y turno (los cancelados no cuentan). Para `jugado`: el día y
turno ya pasaron y la planilla está cargada. Un jugado no cambia de estado.

### Planilla, goles y tarjetas

| Método | Ruta | Body / respuesta |
|---|---|---|
| GET | `/partidos/:id/planilla` | `{partido, editable, motivo_no_editable, local: [...], visitante: [...], goles: [...], tarjetas: [...]}` |
| PUT | `/partidos/:id/planilla` | `{jugadores: [{ci_jugador, id_equipo}]}` reemplaza la planilla completa |
| POST | `/partidos/:id/goles` | `{ci_jugador, minuto, autogol}` (minuto 1-60) |
| DELETE | `/goles/:id` | |
| POST | `/partidos/:id/tarjetas` | `{ci_jugador, minuto, color}` |
| DELETE | `/tarjetas/:id` | |

Cada jugador de `local`/`visitante`: `{ci, id_equipo, nombre, apellido, numero_camiseta, suspendido, motivo_suspension, en_planilla}`.
Cada gol/tarjeta: columnas + `jugador` (nombre) + `id_equipo` (de la planilla).

Reglas: solo jugadores del plantel de alguno de los dos equipos y **no
suspendidos** para esa fecha; goles/tarjetas solo para quien figura en la
planilla; minuto 0-60; la planilla se carga cuando el horario ya pasó y, si el
partido está jugado, solo dentro de las **48 horas** posteriores. El resultado se
calcula siempre desde la tabla `gol` (un autogol suma al rival).

**Sanciones automáticas:** al insertar/borrar una tarjeta, roja → 1 fecha;
cada 3 amarillas acumuladas en la edición → 1 fecha; se cumplen en la fecha
siguiente. Recomendado: trigger `AFTER INSERT ON tarjeta` en MySQL (o recalcular en
el backend dentro de la misma transacción).

### Sanciones

| Método | Ruta | Notas |
|---|---|---|
| GET | `/sanciones?id_torneo=` | Agrega `jugador`, `equipo`, `automatica` (bool) |
| POST | `/sanciones` | `{ci_jugador, id_torneo, numero_fecha_inicio, cantidad_fechas}` → motivo `disciplinaria`. |
| PUT / DELETE | `/sanciones/:id` | Solo disciplinarias; las automáticas se corrigen desde las tarjetas |

### Reportes — `GET /reportes/:clave?id_torneo=`

| Clave | Filas | Idea SQL |
|---|---|---|
| `posiciones` | `{pos, equipo, pj, pg, pe, pp, gf, gc, dg, pts}` | Vista con goles por equipo y partido (UNION local/visitante), `GROUP BY` equipo, `ORDER BY pts DESC, dg DESC, gf DESC` |
| `goleadores` | `{pos, jugador, equipo, goles}` | `gol` JOIN `partido` (jugado) `WHERE autogol = 0 GROUP BY ci ORDER BY goles DESC LIMIT 10` |
| `fair-play` | `{pos, equipo, amarillas, rojas, puntaje}` | `SUM(CASE color WHEN 'roja' THEN 3 ELSE 1 END)`, `LEFT JOIN` para incluir equipos sin tarjetas, `ORDER BY puntaje ASC` |
| `promedio-goles` | `{fecha, partidos, goles, promedio}` + fila final con `total: true` | `GROUP BY numero_fecha` + `WITH ROLLUP` o UNION |
| `uso-canchas` | `{canchas: [{cancha, partidos}], turnos: [{turno, partidos}]}` | Dos `GROUP BY ... ORDER BY COUNT(*) DESC` excluyendo cancelados |
| `jugadores-facultad-tipo` | `{facultad, grado, posgrado, docente, funcionario, total}` | `SUM(tipo = 'grado')` … agrupado por facultad |
| `nunca-jugaron` | `{ci, jugador, equipo, camiseta}` | `equipo_jugador_torneo` `WHERE NOT EXISTS` en `planilla_partido` |
| `sanciones-equipo` | `{equipo, roja, acumulacion, disciplinaria, total}` | JOIN a `equipo_jugador_torneo`, conteo por motivo |
| `estado-partidos` | `{estado, partidos, porcentaje}` | `COUNT(*) * 100 / (SELECT COUNT(*) ...)` |
| `valla-menos-vencida` *(extra)* | `{equipo, pj, gc, promedio_gc}` | De la vista de posiciones, `gc / pj ASC` |
| `goles-por-tramo` *(extra)* | `{tramo, goles}` | `CEIL(minuto / 10)` agrupado |
| `jugadores-tarjetas` *(extra)* | `{jugador, equipo, amarillas, rojas, puntos}` | Igual que fair play pero por jugador, `LIMIT 10` |
