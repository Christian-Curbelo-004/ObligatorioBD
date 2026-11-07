from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin, require_auth

bp = Blueprint("torneos", __name__, url_prefix="/torneos")

ESTADOS = {"inscripcion", "en curso", "finalizado"}
SEMESTRES = {"1", "2"}
_CAMPOS_UPDATE = {"nombre", "anio", "semestre", "fecha_inicio", "fecha_fin", "estado"}


@bp.route("/", methods=["GET"])
@require_auth
def listar():
    return jsonify(db.query_all("SELECT * FROM torneo"))


@bp.route("/<int:id_torneo>", methods=["GET"])
@require_auth
def obtener(id_torneo):
    row = db.query_one("SELECT * FROM torneo WHERE id_torneo = %s", (id_torneo,))
    if not row:
        return jsonify({"error": "Torneo no encontrado"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    data = request.get_json(silent=True) or {}
    nombre = data.get("nombre", "").strip()
    anio = data.get("anio")
    semestre = str(data.get("semestre", ""))
    estado = data.get("estado", "inscripcion")

    if not nombre:
        return jsonify({"error": "nombre requerido"}), 400
    if not anio:
        return jsonify({"error": "anio requerido"}), 400
    if semestre not in SEMESTRES:
        return jsonify({"error": "semestre debe ser 1 o 2"}), 400
    if estado not in ESTADOS:
        return jsonify({"error": f"estado debe ser uno de {ESTADOS}"}), 400

    lastrowid, _ = db.execute(
        "INSERT INTO torneo (nombre, anio, semestre, fecha_inicio, fecha_fin, estado) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (nombre, anio, semestre, data.get("fecha_inicio"), data.get("fecha_fin"), estado),
    )
    return jsonify({"id_torneo": lastrowid, "message": "Torneo creado"}), 201


@bp.route("/<int:id_torneo>", methods=["PUT"])
@require_admin
def actualizar(id_torneo):
    data = request.get_json(silent=True) or {}
    if "estado" in data and data["estado"] not in ESTADOS:
        return jsonify({"error": f"estado debe ser uno de {ESTADOS}"}), 400

    campos = {k: v for k, v in data.items() if k in _CAMPOS_UPDATE}
    if not campos:
        return jsonify({"error": "Sin campos válidos para actualizar"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [id_torneo]
    _, rowcount = db.execute(
        f"UPDATE torneo SET {set_clause} WHERE id_torneo = %s", vals
    )
    if rowcount == 0:
        return jsonify({"error": "Torneo no encontrado"}), 404
    return jsonify({"message": "Torneo actualizado"})


@bp.route("/<int:id_torneo>", methods=["DELETE"])
@require_admin
def eliminar(id_torneo):
    _, rowcount = db.execute("DELETE FROM torneo WHERE id_torneo = %s", (id_torneo,))
    if rowcount == 0:
        return jsonify({"error": "Torneo no encontrado"}), 404
    return jsonify({"message": "Torneo eliminado"})
