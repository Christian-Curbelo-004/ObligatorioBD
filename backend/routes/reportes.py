from datetime import timedelta
from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_auth


def _fmt_time(td):
    """Convierte timedelta (devuelto por MySQL para campos TIME) a string HH:MM:SS."""
    if isinstance(td, timedelta):
        total = int(td.total_seconds())
        h, rem = divmod(total, 3600)
        m, s = divmod(rem, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"
    return str(td) if td is not None else None

bp = Blueprint("reportes", __name__, url_prefix="/reportes")


@bp.route("/posiciones/<int:id_torneo>", methods=["GET"])
@require_auth
def tabla_posiciones(id_torneo):
    """Tabla de posiciones: PJ, PG, PE, PP, GF, GC, DG, puntos."""
    rows = db.query_all("""
        SELECT
            e.id_equipo,
            e.nombre AS equipo,
            COUNT(p.id_partido) AS PJ,
            SUM(CASE
                WHEN (p.id_equipo_local = e.id_equipo
                      AND COALESCE(gf.goles_local,0) > COALESCE(gf.goles_visit,0))
                  OR (p.id_equipo_visitante = e.id_equipo
                      AND COALESCE(gf.goles_visit,0) > COALESCE(gf.goles_local,0)) THEN 1
                ELSE 0 END) AS PG,
            SUM(CASE WHEN p.id_partido IS NOT NULL
                      AND COALESCE(gf.goles_local,0) = COALESCE(gf.goles_visit,0) THEN 1
                ELSE 0 END) AS PE,
            SUM(CASE
                WHEN (p.id_equipo_local = e.id_equipo
                      AND COALESCE(gf.goles_local,0) < COALESCE(gf.goles_visit,0))
                  OR (p.id_equipo_visitante = e.id_equipo
                      AND COALESCE(gf.goles_visit,0) < COALESCE(gf.goles_local,0)) THEN 1
                ELSE 0 END) AS PP,
            COALESCE(SUM(CASE WHEN p.id_equipo_local = e.id_equipo
                              THEN COALESCE(gf.goles_local,0)
                              ELSE COALESCE(gf.goles_visit,0) END), 0) AS GF,
            COALESCE(SUM(CASE WHEN p.id_equipo_local = e.id_equipo
                              THEN COALESCE(gf.goles_visit,0)
                              ELSE COALESCE(gf.goles_local,0) END), 0) AS GC,
            COALESCE(SUM(CASE WHEN p.id_equipo_local = e.id_equipo
                              THEN COALESCE(gf.goles_local,0) - COALESCE(gf.goles_visit,0)
                              ELSE COALESCE(gf.goles_visit,0) - COALESCE(gf.goles_local,0) END), 0) AS DG,
            COALESCE(SUM(CASE
                WHEN (p.id_equipo_local = e.id_equipo
                      AND COALESCE(gf.goles_local,0) > COALESCE(gf.goles_visit,0))
                  OR (p.id_equipo_visitante = e.id_equipo
                      AND COALESCE(gf.goles_visit,0) > COALESCE(gf.goles_local,0)) THEN 3
                WHEN p.id_partido IS NOT NULL
                     AND COALESCE(gf.goles_local,0) = COALESCE(gf.goles_visit,0) THEN 1
                ELSE 0 END), 0) AS puntos
        FROM equipo e
        LEFT JOIN partido p ON (p.id_equipo_local = e.id_equipo OR p.id_equipo_visitante = e.id_equipo)
            AND p.id_torneo = %s AND p.estado = 'jugado'
        LEFT JOIN (
            SELECT
                g.id_partido,
                SUM(CASE WHEN g.autogol = 0 AND pp.id_equipo = p2.id_equipo_local THEN 1
                         WHEN g.autogol = 1 AND pp.id_equipo != p2.id_equipo_local THEN 1
                         ELSE 0 END) AS goles_local,
                SUM(CASE WHEN g.autogol = 0 AND pp.id_equipo = p2.id_equipo_visitante THEN 1
                         WHEN g.autogol = 1 AND pp.id_equipo != p2.id_equipo_visitante THEN 1
                         ELSE 0 END) AS goles_visit
            FROM gol g
            JOIN planilla_partido pp ON g.id_partido = pp.id_partido AND g.ci_jugador = pp.ci_jugador
            JOIN partido p2 ON g.id_partido = p2.id_partido
            GROUP BY g.id_partido
        ) gf ON gf.id_partido = p.id_partido
        WHERE e.id_torneo = %s
        GROUP BY e.id_equipo, e.nombre
        ORDER BY puntos DESC, DG DESC, GF DESC
    """, (id_torneo, id_torneo))
    return jsonify(rows)


@bp.route("/goleadores/<int:id_torneo>", methods=["GET"])
@require_auth
def goleadores(id_torneo):
    """Top 10 goleadores de la edición (sin autogoles)."""
    rows = db.query_all("""
        SELECT j.ci, j.nombre, j.apellido, COUNT(g.id_gol) AS goles
        FROM gol g
        JOIN jugador j ON g.ci_jugador = j.ci
        JOIN partido p ON g.id_partido = p.id_partido
        WHERE p.id_torneo = %s AND g.autogol = 0
        GROUP BY j.ci, j.nombre, j.apellido
        ORDER BY goles DESC
        LIMIT 10
    """, (id_torneo,))
    return jsonify(rows)


@bp.route("/fairplay/<int:id_torneo>", methods=["GET"])
@require_auth
def fairplay(id_torneo):
    """Tabla fair play por equipo (amarilla=1pt, roja=3pt; menor puntaje es mejor)."""
    rows = db.query_all("""
        SELECT e.id_equipo, e.nombre AS equipo,
               SUM(CASE t.color WHEN 'amarilla' THEN 1 WHEN 'roja' THEN 3 ELSE 0 END) AS puntaje_fairplay
        FROM equipo e
        JOIN equipo_jugador_torneo ejt ON e.id_equipo = ejt.id_equipo
        LEFT JOIN tarjeta t ON t.ci_jugador = ejt.ci_jugador
            AND t.id_partido IN (SELECT id_partido FROM partido WHERE id_torneo = %s)
        WHERE e.id_torneo = %s
        GROUP BY e.id_equipo, e.nombre
        ORDER BY puntaje_fairplay ASC
    """, (id_torneo, id_torneo))
    return jsonify(rows)


@bp.route("/promedio-goles/<int:id_torneo>", methods=["GET"])
@require_auth
def promedio_goles(id_torneo):
    """Promedio de goles por partido en cada fecha y en toda la edición."""
    por_fecha = db.query_all("""
        SELECT p.numero_fecha,
               COUNT(DISTINCT p.id_partido) AS partidos,
               COUNT(g.id_gol) AS goles,
               ROUND(COUNT(g.id_gol) / COUNT(DISTINCT p.id_partido), 2) AS promedio
        FROM partido p
        LEFT JOIN gol g ON p.id_partido = g.id_partido
        WHERE p.id_torneo = %s AND p.estado = 'jugado'
        GROUP BY p.numero_fecha
        ORDER BY p.numero_fecha
    """, (id_torneo,))

    total = db.query_one("""
        SELECT COUNT(DISTINCT p.id_partido) AS partidos,
               COUNT(g.id_gol) AS goles,
               ROUND(COUNT(g.id_gol) / NULLIF(COUNT(DISTINCT p.id_partido), 0), 2) AS promedio
        FROM partido p
        LEFT JOIN gol g ON p.id_partido = g.id_partido
        WHERE p.id_torneo = %s AND p.estado = 'jugado'
    """, (id_torneo,))

    return jsonify({"por_fecha": por_fecha, "total": total})


@bp.route("/canchas-turnos/<int:id_torneo>", methods=["GET"])
@require_auth
def canchas_turnos(id_torneo):
    """Canchas y turnos más utilizados en la edición."""
    canchas = db.query_all("""
        SELECT p.nombre_cancha, p.id_complejo, c.nombre AS nombre_complejo,
               COUNT(*) AS partidos
        FROM partido p
        JOIN complejo c ON p.id_complejo = c.id_complejo
        WHERE p.id_torneo = %s AND p.estado = 'jugado'
        GROUP BY p.nombre_cancha, p.id_complejo, c.nombre
        ORDER BY partidos DESC
    """, (id_torneo,))

    turnos = db.query_all("""
        SELECT p.id_turno, t.hora_inicio, t.hora_fin, COUNT(*) AS partidos
        FROM partido p
        JOIN turno t ON p.id_turno = t.id_turno
        WHERE p.id_torneo = %s AND p.estado = 'jugado'
        GROUP BY p.id_turno, t.hora_inicio, t.hora_fin
        ORDER BY partidos DESC
    """, (id_torneo,))

    for t in turnos:
        t["hora_inicio"] = _fmt_time(t["hora_inicio"])
        t["hora_fin"] = _fmt_time(t["hora_fin"])

    return jsonify({"canchas": canchas, "turnos": turnos})


@bp.route("/jugadores-por-facultad", methods=["GET"])
@require_auth
def jugadores_por_facultad():
    """Cantidad de jugadores por facultad y por tipo."""
    rows = db.query_all("""
        SELECT f.nombre AS facultad, j.tipo, COUNT(*) AS cantidad
        FROM jugador j
        JOIN facultad f ON j.id_facultad = f.id_facultad
        GROUP BY f.nombre, j.tipo
        ORDER BY f.nombre, j.tipo
    """)
    return jsonify(rows)


@bp.route("/jugadores-sin-planilla/<int:id_torneo>", methods=["GET"])
@require_auth
def jugadores_sin_planilla(id_torneo):
    """Jugadores inscritos en algún plantel que nunca figuraron en una planilla."""
    rows = db.query_all("""
        SELECT DISTINCT j.ci, j.nombre, j.apellido, e.nombre AS equipo
        FROM equipo_jugador_torneo ejt
        JOIN jugador j ON ejt.ci_jugador = j.ci
        JOIN equipo e ON ejt.id_equipo = e.id_equipo
        WHERE ejt.id_torneo = %s
          AND ejt.ci_jugador NOT IN (
              SELECT DISTINCT pp.ci_jugador
              FROM planilla_partido pp
              JOIN partido p ON pp.id_partido = p.id_partido
              WHERE p.id_torneo = %s
          )
        ORDER BY j.apellido, j.nombre
    """, (id_torneo, id_torneo))
    return jsonify(rows)


@bp.route("/sanciones-por-equipo/<int:id_torneo>", methods=["GET"])
@require_auth
def sanciones_por_equipo(id_torneo):
    """Cantidad de sanciones por equipo y por motivo."""
    rows = db.query_all("""
        SELECT e.nombre AS equipo, s.motivo, COUNT(*) AS cantidad
        FROM sancion_jugador s
        JOIN equipo_jugador_torneo ejt
            ON s.ci_jugador = ejt.ci_jugador AND s.id_torneo = ejt.id_torneo
        JOIN equipo e ON ejt.id_equipo = e.id_equipo
        WHERE s.id_torneo = %s
        GROUP BY e.nombre, s.motivo
        ORDER BY e.nombre, s.motivo
    """, (id_torneo,))
    return jsonify(rows)


@bp.route("/porcentaje-partidos/<int:id_torneo>", methods=["GET"])
@require_auth
def porcentaje_partidos(id_torneo):
    """Porcentaje de partidos jugados vs postergados/cancelados."""
    row = db.query_one("""
        SELECT
            COUNT(*) AS total,
            SUM(estado = 'jugado') AS jugados,
            SUM(estado IN ('postergado','cancelado')) AS no_jugados,
            ROUND(SUM(estado = 'jugado') * 100.0 / COUNT(*), 2) AS pct_jugados,
            ROUND(SUM(estado IN ('postergado','cancelado')) * 100.0 / COUNT(*), 2) AS pct_no_jugados
        FROM partido
        WHERE id_torneo = %s
    """, (id_torneo,))
    return jsonify(row)


# --- 3 consultas adicionales ---

@bp.route("/racha-invicta/<int:id_torneo>", methods=["GET"])
@require_auth
def racha_invicta(id_torneo):
    """Racha de partidos sin perder (ganados + empatados) por equipo."""
    rows = db.query_all("""
        SELECT e.id_equipo, e.nombre AS equipo,
               SUM(CASE
                   WHEN (p.id_equipo_local = e.id_equipo
                         AND COALESCE(gf.goles_local,0) >= COALESCE(gf.goles_visit,0))
                     OR (p.id_equipo_visitante = e.id_equipo
                         AND COALESCE(gf.goles_visit,0) >= COALESCE(gf.goles_local,0))
                   THEN 1 ELSE 0 END) AS partidos_sin_perder
        FROM equipo e
        LEFT JOIN partido p ON (p.id_equipo_local = e.id_equipo OR p.id_equipo_visitante = e.id_equipo)
            AND p.id_torneo = %s AND p.estado = 'jugado'
        LEFT JOIN (
            SELECT g.id_partido,
                SUM(CASE WHEN g.autogol=0 AND pp.id_equipo=p2.id_equipo_local THEN 1
                         WHEN g.autogol=1 AND pp.id_equipo!=p2.id_equipo_local THEN 1
                         ELSE 0 END) AS goles_local,
                SUM(CASE WHEN g.autogol=0 AND pp.id_equipo=p2.id_equipo_visitante THEN 1
                         WHEN g.autogol=1 AND pp.id_equipo!=p2.id_equipo_visitante THEN 1
                         ELSE 0 END) AS goles_visit
            FROM gol g
            JOIN planilla_partido pp ON g.id_partido = pp.id_partido AND g.ci_jugador = pp.ci_jugador
            JOIN partido p2 ON g.id_partido = p2.id_partido
            GROUP BY g.id_partido
        ) gf ON gf.id_partido = p.id_partido
        WHERE e.id_torneo = %s
        GROUP BY e.id_equipo, e.nombre
        ORDER BY partidos_sin_perder DESC
    """, (id_torneo, id_torneo))
    return jsonify(rows)


@bp.route("/fecha-mas-goles/<int:id_torneo>", methods=["GET"])
@require_auth
def fecha_mas_goles(id_torneo):
    """Fecha con más goles convertidos en la edición."""
    rows = db.query_all("""
        SELECT p.numero_fecha, COUNT(g.id_gol) AS total_goles
        FROM partido p
        LEFT JOIN gol g ON p.id_partido = g.id_partido
        WHERE p.id_torneo = %s AND p.estado = 'jugado'
        GROUP BY p.numero_fecha
        ORDER BY total_goles DESC
    """, (id_torneo,))
    return jsonify(rows)


@bp.route("/equipos-sin-sanciones/<int:id_torneo>", methods=["GET"])
@require_auth
def equipos_sin_sanciones(id_torneo):
    """Equipos cuyos jugadores no recibieron ninguna sanción en la edición."""
    rows = db.query_all("""
        SELECT e.id_equipo, e.nombre AS equipo
        FROM equipo e
        WHERE e.id_torneo = %s
          AND e.id_equipo NOT IN (
              SELECT DISTINCT ejt.id_equipo
              FROM sancion_jugador s
              JOIN equipo_jugador_torneo ejt
                  ON s.ci_jugador = ejt.ci_jugador AND s.id_torneo = ejt.id_torneo
              WHERE s.id_torneo = %s
          )
        ORDER BY e.nombre
    """, (id_torneo, id_torneo))
    return jsonify(rows)
