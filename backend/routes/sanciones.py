from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin, require_auth

bp = Blueprint("sanciones", __name__, url_prefix="/sanciones")

MOTIVOS = {"roja", "acumulacion de amarillas", "disciplinaria"}
_CAMPOS_UPDATE = {"motivo", "numero_fecha_inicio", "cantidad_fechas"}


@bp.route("/", methods=["GET"])
@require_auth
def listar():
    id_torneo = request.args.get("id_torneo")
    if id_torneo:
        rows = db.query_all(
            "SELECT s.*, j.nombre, j.apellido "
            "FROM sancion_jugador s JOIN jugador j ON s.ci_jugador = j.ci "
            "WHERE s.id_torneo = %s",
            (id_torneo,),
        )
    else:
        rows = db.query_all(
            "SELECT s.*, j.nombre, j.apellido "
            "FROM sancion_jugador s JOIN jugador j ON s.ci_jugador = j.ci"
        )
    return jsonify(rows)


@bp.route("/<int:id_sancion>", methods=["GET"])
@require_auth
def obtener(id_sancion):
    row = db.query_one(
        "SELECT s.*, j.nombre, j.apellido "
        "FROM sancion_jugador s JOIN jugador j ON s.ci_jugador = j.ci "
        "WHERE s.id_sancion = %s",
        (id_sancion,),
    )
    if not row:
        return jsonify({"error": "Sanción no encontrada"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    """Crea una sanción disciplinaria manual (varias fechas)."""
    data = request.get_json(silent=True) or {}
    ci_jugador = data.get("ci_jugador", "").strip()
    id_torneo = data.get("id_torneo")
    motivo = data.get("motivo", "")
    numero_fecha_inicio = data.get("numero_fecha_inicio")
    cantidad_fechas = data.get("cantidad_fechas", 1)

    if not ci_jugador or not id_torneo or not numero_fecha_inicio:
        return jsonify({"error": "ci_jugador, id_torneo y numero_fecha_inicio requeridos"}), 400
    if motivo != "disciplinaria":
        return jsonify({"error": "Solo se pueden crear manualmente sanciones disciplinarias; las de roja y acumulacion las genera el sistema"}), 400
    try:
        if int(cantidad_fechas) < 1:
            return jsonify({"error": "cantidad_fechas debe ser >= 1"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "cantidad_fechas debe ser un entero >= 1"}), 400

    lastrowid, _ = db.execute(
        "INSERT INTO sancion_jugador (ci_jugador, id_torneo, motivo, numero_fecha_inicio, cantidad_fechas) "
        "VALUES (%s, %s, %s, %s, %s)",
        (ci_jugador, id_torneo, motivo, numero_fecha_inicio, cantidad_fechas),
    )
    return jsonify({"id_sancion": lastrowid, "message": "Sanción creada"}), 201


@bp.route("/<int:id_sancion>", methods=["PUT"])
@require_admin
def actualizar(id_sancion):
    data = request.get_json(silent=True) or {}
    if "motivo" in data and data["motivo"] not in MOTIVOS:
        return jsonify({"error": f"motivo debe ser uno de {MOTIVOS}"}), 400

    campos = {k: v for k, v in data.items() if k in _CAMPOS_UPDATE}
    if not campos:
        return jsonify({"error": "Sin campos válidos para actualizar"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [id_sancion]
    _, rowcount = db.execute(
        f"UPDATE sancion_jugador SET {set_clause} WHERE id_sancion = %s", vals
    )
    if rowcount == 0:
        return jsonify({"error": "Sanción no encontrada"}), 404
    return jsonify({"message": "Sanción actualizada"})


@bp.route("/<int:id_sancion>", methods=["DELETE"])
@require_admin
def eliminar(id_sancion):
    _, rowcount = db.execute(
        "DELETE FROM sancion_jugador WHERE id_sancion = %s", (id_sancion,)
    )
    if rowcount == 0:
        return jsonify({"error": "Sanción no encontrada"}), 404
    return jsonify({"message": "Sanción eliminada"})
