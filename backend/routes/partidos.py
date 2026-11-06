from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin

bp = Blueprint("partidos", __name__, url_prefix="/partidos")

ESTADOS = {"programado", "jugado", "postergado", "cancelado"}


def _validar_programacion(data, id_partido=None):
    """Aplica todas las reglas de negocio para programar un partido."""
    id_torneo = data["id_torneo"]
    id_local = data["id_equipo_local"]
    id_visit = data["id_equipo_visitante"]
    numero_fecha = data["numero_fecha"]
    dia = data["dia"]
    id_turno = data["id_turno"]
    nombre_cancha = data["nombre_cancha"]
    id_complejo = data["id_complejo"]

    if id_local == id_visit:
        return "Un equipo no puede enfrentarse a sí mismo"

    # Ambos equipos deben pertenecer al mismo torneo
    for eid in (id_local, id_visit):
        eq = db.query_one(
            "SELECT id_torneo FROM equipo WHERE id_equipo = %s", (eid,)
        )
        if not eq or eq["id_torneo"] != id_torneo:
            return f"Equipo {eid} no pertenece al torneo {id_torneo}"

    # Ambos equipos deben tener al menos 5 jugadores
    for eid in (id_local, id_visit):
        cnt = db.query_one(
            "SELECT COUNT(*) AS c FROM equipo_jugador_torneo WHERE id_equipo = %s", (eid,)
        )
        if cnt["c"] < 5:
            return f"Equipo {eid} tiene menos de 5 jugadores en el plantel"

    # No puede haber ya un partido activo entre los dos equipos en esta edición
    excl = f"AND id_partido != {id_partido}" if id_partido else ""
    dup = db.query_one(
        f"SELECT 1 FROM partido "
        f"WHERE id_torneo = %s AND estado != 'cancelado' "
        f"AND ((id_equipo_local = %s AND id_equipo_visitante = %s) "
        f"  OR (id_equipo_local = %s AND id_equipo_visitante = %s)) {excl}",
        (id_torneo, id_local, id_visit, id_visit, id_local),
    )
    if dup:
        return "Ya existe un partido entre esos equipos en esta edición"

    # Cada equipo juega como máximo una vez por fecha
    for eid in (id_local, id_visit):
        clash = db.query_one(
            f"SELECT 1 FROM partido "
            f"WHERE id_torneo = %s AND numero_fecha = %s AND estado != 'cancelado' "
            f"AND (id_equipo_local = %s OR id_equipo_visitante = %s) {excl}",
            (id_torneo, numero_fecha, eid, eid),
        )
        if clash:
            return f"Equipo {eid} ya tiene un partido en la fecha {numero_fecha}"

    # La cancha no puede tener otro partido el mismo día y turno
    cancha_clash = db.query_one(
        f"SELECT 1 FROM partido "
        f"WHERE nombre_cancha = %s AND id_complejo = %s AND dia = %s AND id_turno = %s "
        f"AND estado != 'cancelado' {excl}",
        (nombre_cancha, id_complejo, dia, id_turno),
    )
    if cancha_clash:
        return "La cancha ya tiene un partido asignado en ese día y turno"

    return None  # sin errores


@bp.route("/", methods=["GET"])
@require_admin
def listar():
    id_torneo = request.args.get("id_torneo")
    if id_torneo:
        rows = db.query_all("SELECT * FROM partido WHERE id_torneo = %s", (id_torneo,))
    else:
        rows = db.query_all("SELECT * FROM partido")
    return jsonify(rows)


@bp.route("/<int:id_partido>", methods=["GET"])
@require_admin
def obtener(id_partido):
    row = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not row:
        return jsonify({"error": "Partido no encontrado"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    data = request.get_json(silent=True) or {}
    campos_req = ["id_torneo", "numero_fecha", "id_equipo_local",
                  "id_equipo_visitante", "dia", "id_turno", "nombre_cancha", "id_complejo"]
    for c in campos_req:
        if not data.get(c):
            return jsonify({"error": f"{c} requerido"}), 400

    error = _validar_programacion(data)
    if error:
        return jsonify({"error": error}), 409

    lastrowid, _ = db.execute(
        "INSERT INTO partido (id_torneo, numero_fecha, id_equipo_local, id_equipo_visitante, "
        "dia, id_turno, nombre_cancha, id_complejo, estado) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'programado')",
        (data["id_torneo"], data["numero_fecha"], data["id_equipo_local"],
         data["id_equipo_visitante"], data["dia"], data["id_turno"],
         data["nombre_cancha"], data["id_complejo"]),
    )
    return jsonify({"id_partido": lastrowid, "message": "Partido creado"}), 201


@bp.route("/<int:id_partido>", methods=["PUT"])
@require_admin
def actualizar(id_partido):
    partido = db.query_one("SELECT * FROM partido WHERE id_partido = %s", (id_partido,))
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if partido["estado"] == "jugado":
        return jsonify({"error": "Un partido jugado no puede modificarse por esta vía"}), 409

    data = request.get_json(silent=True) or {}
    if "estado" in data and data["estado"] not in ESTADOS:
        return jsonify({"error": f"estado debe ser uno de {ESTADOS}"}), 400

    merged = {**partido, **data}
    if any(k in data for k in ("id_equipo_local", "id_equipo_visitante", "dia",
                                "id_turno", "nombre_cancha", "id_complejo", "numero_fecha")):
        error = _validar_programacion(merged, id_partido=id_partido)
        if error:
            return jsonify({"error": error}), 409

    campos = {k: v for k, v in data.items()}
    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [id_partido]
    db.execute(f"UPDATE partido SET {set_clause} WHERE id_partido = %s", vals)
    return jsonify({"message": "Partido actualizado"})


@bp.route("/<int:id_partido>", methods=["DELETE"])
@require_admin
def eliminar(id_partido):
    partido = db.query_one(
        "SELECT estado FROM partido WHERE id_partido = %s", (id_partido,)
    )
    if not partido:
        return jsonify({"error": "Partido no encontrado"}), 404
    if partido["estado"] == "jugado":
        return jsonify({"error": "Un partido jugado no puede eliminarse"}), 409

    db.execute("DELETE FROM partido WHERE id_partido = %s", (id_partido,))
    return jsonify({"message": "Partido eliminado"})
