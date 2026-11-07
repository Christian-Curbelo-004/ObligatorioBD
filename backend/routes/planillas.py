from datetime import datetime, timedelta, time as time_type
from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_auth

bp = Blueprint("planillas", __name__, url_prefix="/partidos")


def _td_to_time(td):
    """MySQL devuelve campos TIME como timedelta; lo convierte a time."""
    total = int(td.total_seconds())
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return time_type(h % 24, m, s)


def _partido_jugable(partido):
    """Verifica que el día y turno del partido ya hayan pasado."""
    turno = db.query_one("SELECT hora_fin FROM turno WHERE id_turno = %s", (partido["id_turno"],))
    if not turno:
        return False
    hora_fin = turno["hora_fin"]
    if isinstance(hora_fin, timedelta):
        hora_fin = _td_to_time(hora_fin)
    dt_fin = datetime.combine(partido["dia"], hora_fin)
    return datetime.now() > dt_fin


def _esta_suspendido(ci_jugador, id_torneo, numero_fecha):
    """Devuelve True si el jugador está suspendido en esa fecha del torneo."""
    row = db.query_one(
        "SELECT 1 FROM sancion_jugador "
        "WHERE ci_jugador = %s AND id_torneo = %s "
        "AND numero_fecha_inicio <= %s "
        "AND (numero_fecha_inicio + cantidad_fechas - 1) >= %s",
        (ci_jugador, id_torneo, numero_fecha, numero_fecha),
    )
    return row is not None


@bp.route("/<int:id_partido>/planilla", methods=["GET"])
@require_auth
def ver_planilla(id_partido):
    jugadores = db.query_all(
        "SELECT pp.*, j.nombre, j.apellido "
        "FROM planilla_partido pp JOIN jugador j ON pp.ci_jugador = j.ci "
        "WHERE pp.id_partido = %s",
        (id_partido,),
    )
    goles = db.query_all("SELECT * FROM gol WHERE id_partido = %s", (id_partido,))
    tarjetas = db.query_all("SELECT * FROM tarjeta WHERE id_partido = %s", (id_partido,))
    return jsonify({"jugadores": jugadores, "goles": goles, "tarjetas": tarjetas})


@bp.route("/<int:id_partido>/planilla/jugadores", methods=["POST"])
@require_auth
def registrar_planilla(id_partido):
    """Registra los jugadores que participaron en el partido."""
    partido = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if partido["estado"] == "jugado":
        return jsonify({"error": "La planilla ya fue registrada"}), 409
    if partido["estado"] in ("cancelado", "postergado"):
        return jsonify({"error": "No se puede registrar planilla para un partido cancelado o postergado"}), 409
    if not _partido_jugable(partido):
        return jsonify({"error": "El partido aún no ha finalizado"}), 409

    data = request.get_json(silent=True) or {}
    jugadores = data.get("jugadores", [])  # lista de {ci_jugador, id_equipo}

    if not jugadores:
        return jsonify({"error": "Debe incluir al menos un jugador"}), 400

    stmts = []
    for j in jugadores:
        ci = j.get("ci_jugador")
        id_eq = j.get("id_equipo")
        if not ci or not id_eq:
            return jsonify({"error": "Cada jugador debe tener ci_jugador e id_equipo"}), 400

        # Verificar que el jugador esté en el plantel del equipo en ese torneo
        en_plantel = db.query_one(
            "SELECT 1 FROM equipo_jugador_torneo "
            "WHERE id_equipo = %s AND ci_jugador = %s AND id_torneo = %s",
            (id_eq, ci, partido["id_torneo"]),
        )
        if not en_plantel:
            return jsonify({"error": f"Jugador {ci} no está en el plantel del equipo {id_eq}"}), 409

        # El equipo debe ser uno de los dos participantes
        if id_eq not in (partido["id_equipo_local"], partido["id_equipo_visitante"]):
            return jsonify({"error": f"Equipo {id_eq} no participa en este partido"}), 409

        # No puede estar suspendido
        if _esta_suspendido(ci, partido["id_torneo"], partido["numero_fecha"]):
            return jsonify({"error": f"Jugador {ci} está suspendido para esta fecha"}), 409

        stmts.append((
            "INSERT IGNORE INTO planilla_partido (id_partido, ci_jugador, id_equipo) VALUES (%s, %s, %s)",
            (id_partido, ci, id_eq),
        ))

    stmts.append((
        "UPDATE partido SET estado = 'jugado' WHERE id_partido = %s", (id_partido,)
    ))

    db.execute_many(stmts)
    return jsonify({"message": "Planilla registrada"}), 201


@bp.route("/<int:id_partido>/goles", methods=["POST"])
@require_auth
def registrar_gol(id_partido):
    partido = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if partido["estado"] != "jugado":
        return jsonify({"error": "El partido debe estar en estado jugado"}), 409

    # Solo se puede corregir dentro de 48 h
    if not _dentro_plazo_correccion(partido):
        return jsonify({"error": "Fuera del plazo de corrección de 48 horas"}), 409

    data = request.get_json(silent=True) or {}
    ci = data.get("ci_jugador", "").strip()
    minuto = data.get("minuto")
    autogol = bool(data.get("autogol", False))

    if not ci or minuto is None:
        return jsonify({"error": "ci_jugador y minuto requeridos"}), 400

    # El jugador debe estar en la planilla
    en_planilla = db.query_one(
        "SELECT 1 FROM planilla_partido WHERE id_partido = %s AND ci_jugador = %s",
        (id_partido, ci),
    )
    if not en_planilla:
        return jsonify({"error": "El jugador no figura en la planilla del partido"}), 409

    lastrowid, _ = db.execute(
        "INSERT INTO gol (id_partido, ci_jugador, minuto, autogol) VALUES (%s, %s, %s, %s)",
        (id_partido, ci, minuto, autogol),
    )
    return jsonify({"id_gol": lastrowid, "message": "Gol registrado"}), 201


@bp.route("/<int:id_partido>/tarjetas", methods=["POST"])
@require_auth
def registrar_tarjeta(id_partido):
    partido = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if partido["estado"] != "jugado":
        return jsonify({"error": "El partido debe estar en estado jugado"}), 409

    if not _dentro_plazo_correccion(partido):
        return jsonify({"error": "Fuera del plazo de corrección de 48 horas"}), 409

    data = request.get_json(silent=True) or {}
    ci = data.get("ci_jugador", "").strip()
    minuto = data.get("minuto")
    color = data.get("color", "")

    if not ci or minuto is None or color not in ("amarilla", "roja"):
        return jsonify({"error": "ci_jugador, minuto y color (amarilla/roja) requeridos"}), 400

    en_planilla = db.query_one(
        "SELECT 1 FROM planilla_partido WHERE id_partido = %s AND ci_jugador = %s",
        (id_partido, ci),
    )
    if not en_planilla:
        return jsonify({"error": "El jugador no figura en la planilla"}), 409

    lastrowid, _ = db.execute(
        "INSERT INTO tarjeta (id_partido, ci_jugador, minuto, color) VALUES (%s, %s, %s, %s)",
        (id_partido, ci, minuto, color),
    )
    # Las sanciones automáticas las maneja un trigger en la base de datos.

    return jsonify({"id_tarjeta": lastrowid, "message": "Tarjeta registrada"}), 201


@bp.route("/<int:id_partido>/goles/<int:id_gol>", methods=["DELETE"])
@require_auth
def eliminar_gol(id_partido, id_gol):
    partido = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if not _dentro_plazo_correccion(partido):
        return jsonify({"error": "Fuera del plazo de corrección de 48 horas"}), 409

    _, rowcount = db.execute(
        "DELETE FROM gol WHERE id_gol = %s AND id_partido = %s", (id_gol, id_partido)
    )
    if rowcount == 0:
        return jsonify({"error": "Gol no encontrado"}), 404
    return jsonify({"message": "Gol eliminado"})


@bp.route("/<int:id_partido>/tarjetas/<int:id_tarjeta>", methods=["DELETE"])
@require_auth
def eliminar_tarjeta(id_partido, id_tarjeta):
    partido = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if not _dentro_plazo_correccion(partido):
        return jsonify({"error": "Fuera del plazo de corrección de 48 horas"}), 409

    _, rowcount = db.execute(
        "DELETE FROM tarjeta WHERE id_tarjeta = %s AND id_partido = %s", (id_tarjeta, id_partido)
    )
    if rowcount == 0:
        return jsonify({"error": "Tarjeta no encontrada"}), 404
    return jsonify({"message": "Tarjeta eliminada"})


def _dentro_plazo_correccion(partido):
    """El resultado se puede corregir dentro de las 48 h posteriores al partido."""
    turno = db.query_one("SELECT hora_fin FROM turno WHERE id_turno = %s", (partido["id_turno"],))
    if not turno:
        return False
    hora_fin = turno["hora_fin"]
    if isinstance(hora_fin, timedelta):
        hora_fin = _td_to_time(hora_fin)
    dt_fin = datetime.combine(partido["dia"], hora_fin)
    return datetime.now() <= dt_fin + timedelta(hours=48)
