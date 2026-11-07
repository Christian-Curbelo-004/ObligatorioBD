from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin

bp = Blueprint("jugadores", __name__, url_prefix="/jugadores")

TIPOS_VALIDOS = {"grado", "posgrado", "docente", "funcionario"}
_CAMPOS_UPDATE = {"nombre", "apellido", "email", "fecha_nacimiento", "id_facultad", "tipo"}


def _validate(data, partial=False):
    errors = []
    if not partial or "ci" in data:
        if not str(data.get("ci", "")).strip():
            errors.append("ci requerido")
    if not partial or "nombre" in data:
        if not data.get("nombre", "").strip():
            errors.append("nombre requerido")
    if not partial or "apellido" in data:
        if not data.get("apellido", "").strip():
            errors.append("apellido requerido")
    if not partial or "email" in data:
        email = data.get("email", "")
        if not email or "@" not in email:
            errors.append("email inválido")
    if not partial or "tipo" in data:
        if data.get("tipo") not in TIPOS_VALIDOS:
            errors.append(f"tipo debe ser uno de {TIPOS_VALIDOS}")
    return errors


@bp.route("/", methods=["GET"])
@require_admin
def listar():
    rows = db.query_all(
        "SELECT j.*, f.nombre AS nombre_facultad FROM jugador j "
        "JOIN facultad f ON j.id_facultad = f.id_facultad"
    )
    return jsonify(rows)


@bp.route("/<ci>", methods=["GET"])
@require_admin
def obtener(ci):
    row = db.query_one(
        "SELECT j.*, f.nombre AS nombre_facultad FROM jugador j "
        "JOIN facultad f ON j.id_facultad = f.id_facultad WHERE j.ci = %s",
        (ci,),
    )
    if not row:
        return jsonify({"error": "Jugador no encontrado"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    data = request.get_json(silent=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": errors}), 400

    try:
        db.execute(
            "INSERT INTO jugador (ci, nombre, apellido, email, fecha_nacimiento, id_facultad, tipo) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                data["ci"],
                data["nombre"],
                data["apellido"],
                data["email"],
                data.get("fecha_nacimiento"),
                data.get("id_facultad"),
                data["tipo"],
            ),
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 409

    return jsonify({"message": "Jugador creado"}), 201


@bp.route("/<ci>", methods=["PUT"])
@require_admin
def actualizar(ci):
    data = request.get_json(silent=True) or {}
    errors = _validate(data, partial=True)
    if errors:
        return jsonify({"error": errors}), 400

    campos = {k: v for k, v in data.items() if k in _CAMPOS_UPDATE}
    if not campos:
        return jsonify({"error": "Sin campos válidos para actualizar"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [ci]
    _, rowcount = db.execute(f"UPDATE jugador SET {set_clause} WHERE ci = %s", vals)
    if rowcount == 0:
        return jsonify({"error": "Jugador no encontrado"}), 404
    return jsonify({"message": "Jugador actualizado"})


@bp.route("/<ci>", methods=["DELETE"])
@require_admin
def eliminar(ci):
    _, rowcount = db.execute("DELETE FROM jugador WHERE ci = %s", (ci,))
    if rowcount == 0:
        return jsonify({"error": "Jugador no encontrado"}), 404
    return jsonify({"message": "Jugador eliminado"})
