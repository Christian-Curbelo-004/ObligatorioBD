from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_auth, require_admin

bp = Blueprint("planillas", __name__, url_prefix="/partidos")


def _partido_jugable(partido):
    """Verifica que el día y turno del partido ya hayan pasado."""
    turno = db.query_one("SELECT hora_fin FROM turno WHERE id_turno = %s", (partido["id_turno"],))
    if not turno:
        return False
    dt_fin = datetime.combine(partido["dia"], turno["hora_fin"])
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


def _aplicar_sancion_automatica(ci_jugador, id_torneo, motivo, numero_fecha_partido):
    """Crea una suspensión de 1 fecha a partir de la siguiente fecha del torneo."""
    db.execute(
        "INSERT INTO sancion_jugador (ci_jugador, id_torneo, motivo, numero_fecha_inicio, cantidad_fechas) "
        "VALUES (%s, %s, %s, %s, 1)",
        (ci_jugador, id_torneo, motivo, numero_fecha_partido + 1),
    )


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

    # Sanciones automáticas
    if color == "roja":
        _aplicar_sancion_automatica(ci, partido["id_torneo"], "roja", partido["numero_fecha"])
    else:
        # Contar amarillas acumuladas en la edición
        amarillas = db.query_one(
            "SELECT COUNT(*) AS c FROM tarjeta t "
            "JOIN partido p ON t.id_partido = p.id_partido "
            "WHERE t.ci_jugador = %s AND p.id_torneo = %s AND t.color = 'amarilla'",
            (ci, partido["id_torneo"]),
        )
        if amarillas["c"] % 3 == 0:
            _aplicar_sancion_automatica(
                ci, partido["id_torneo"], "acumulacion_amarillas", partido["numero_fecha"]
            )

    return jsonify({"id_tarjeta": lastrowid, "message": "Tarjeta registrada"}), 201


def _dentro_plazo_correccion(partido):
    """El resultado se puede corregir dentro de las 48 h posteriores al partido."""
    turno = db.query_one("SELECT hora_fin FROM turno WHERE id_turno = %s", (partido["id_turno"],))
    if not turno:
        return False
    dt_fin = datetime.combine(partido["dia"], turno["hora_fin"])
    return datetime.now() <= dt_fin + timedelta(hours=48)
