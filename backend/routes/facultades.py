from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin

bp = Blueprint("facultades", __name__, url_prefix="/facultades")


@bp.route("/", methods=["GET"])
@require_admin
def listar():
    return jsonify(db.query_all("SELECT * FROM facultad"))


@bp.route("/<int:id_facultad>", methods=["GET"])
@require_admin
def obtener(id_facultad):
    row = db.query_one("SELECT * FROM facultad WHERE id_facultad = %s", (id_facultad,))
    if not row:
        return jsonify({"error": "Facultad no encontrada"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    data = request.get_json(silent=True) or {}
    nombre = data.get("nombre", "").strip()
    if not nombre:
        return jsonify({"error": "nombre requerido"}), 400
    lastrowid, _ = db.execute(
        "INSERT INTO facultad (nombre) VALUES (%s)", (nombre,)
    )
    return jsonify({"id_facultad": lastrowid, "message": "Facultad creada"}), 201


@bp.route("/<int:id_facultad>", methods=["PUT"])
@require_admin
def actualizar(id_facultad):
    data = request.get_json(silent=True) or {}
    nombre = data.get("nombre", "").strip()
    if not nombre:
        return jsonify({"error": "nombre requerido"}), 400
    _, rowcount = db.execute(
        "UPDATE facultad SET nombre = %s WHERE id_facultad = %s", (nombre, id_facultad)
    )
    if rowcount == 0:
        return jsonify({"error": "Facultad no encontrada"}), 404
    return jsonify({"message": "Facultad actualizada"})


@bp.route("/<int:id_facultad>", methods=["DELETE"])
@require_admin
def eliminar(id_facultad):
    _, rowcount = db.execute(
        "DELETE FROM facultad WHERE id_facultad = %s", (id_facultad,)
    )
    if rowcount == 0:
        return jsonify({"error": "Facultad no encontrada"}), 404
    return jsonify({"message": "Facultad eliminada"})
