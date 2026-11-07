from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin, require_auth

bp = Blueprint("complejos", __name__, url_prefix="/complejos")

SUPERFICIES = {"sintetico", "parquet"}
_CAMPOS_UPDATE_COMPLEJO = {"nombre", "direccion", "departamento"}
_CAMPOS_UPDATE_CANCHA = {"superficie", "techada"}


@bp.route("/", methods=["GET"])
@require_auth
def listar():
    return jsonify(db.query_all("SELECT * FROM complejo"))


@bp.route("/<int:id_complejo>", methods=["GET"])
@require_auth
def obtener(id_complejo):
    row = db.query_one("SELECT * FROM complejo WHERE id_complejo = %s", (id_complejo,))
    if not row:
        return jsonify({"error": "Complejo no encontrado"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    data = request.get_json(silent=True) or {}
    nombre = data.get("nombre", "").strip()
    direccion = data.get("direccion", "").strip()
    departamento = data.get("departamento", "").strip()

    if not nombre or not direccion or not departamento:
        return jsonify({"error": "nombre, direccion y departamento requeridos"}), 400

    lastrowid, _ = db.execute(
        "INSERT INTO complejo (nombre, direccion, departamento) VALUES (%s, %s, %s)",
        (nombre, direccion, departamento),
    )
    return jsonify({"id_complejo": lastrowid, "message": "Complejo creado"}), 201


@bp.route("/<int:id_complejo>", methods=["PUT"])
@require_admin
def actualizar(id_complejo):
    data = request.get_json(silent=True) or {}
    campos = {k: v for k, v in data.items() if k in _CAMPOS_UPDATE_COMPLEJO}
    if not campos:
        return jsonify({"error": "Sin campos válidos para actualizar"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [id_complejo]
    _, rowcount = db.execute(
        f"UPDATE complejo SET {set_clause} WHERE id_complejo = %s", vals
    )
    if rowcount == 0:
        return jsonify({"error": "Complejo no encontrado"}), 404
    return jsonify({"message": "Complejo actualizado"})


@bp.route("/<int:id_complejo>", methods=["DELETE"])
@require_admin
def eliminar(id_complejo):
    _, rowcount = db.execute("DELETE FROM complejo WHERE id_complejo = %s", (id_complejo,))
    if rowcount == 0:
        return jsonify({"error": "Complejo no encontrado"}), 404
    return jsonify({"message": "Complejo eliminado"})


# --- Canchas ---

@bp.route("/<int:id_complejo>/canchas", methods=["GET"])
@require_auth
def listar_canchas(id_complejo):
    return jsonify(db.query_all(
        "SELECT * FROM cancha WHERE id_complejo = %s", (id_complejo,)
    ))


@bp.route("/<int:id_complejo>/canchas", methods=["POST"])
@require_admin
def crear_cancha(id_complejo):
    data = request.get_json(silent=True) or {}
    nombre_cancha = data.get("nombre_cancha", "").strip()
    superficie = data.get("superficie", "")
    techada = data.get("techada")

    if not nombre_cancha:
        return jsonify({"error": "nombre_cancha requerido"}), 400
    if superficie not in SUPERFICIES:
        return jsonify({"error": f"superficie debe ser {SUPERFICIES}"}), 400
    if techada is None:
        return jsonify({"error": "techada requerido (true/false)"}), 400

    try:
        db.execute(
            "INSERT INTO cancha (nombre_cancha, id_complejo, superficie, techada) VALUES (%s, %s, %s, %s)",
            (nombre_cancha, id_complejo, superficie, bool(techada)),
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 409

    return jsonify({"message": "Cancha creada"}), 201


@bp.route("/<int:id_complejo>/canchas/<nombre_cancha>", methods=["PUT"])
@require_admin
def actualizar_cancha(id_complejo, nombre_cancha):
    data = request.get_json(silent=True) or {}
    if "superficie" in data and data["superficie"] not in SUPERFICIES:
        return jsonify({"error": f"superficie debe ser {SUPERFICIES}"}), 400

    campos = {k: v for k, v in data.items() if k in _CAMPOS_UPDATE_CANCHA}
    if not campos:
        return jsonify({"error": "Sin campos válidos para actualizar"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [nombre_cancha, id_complejo]
    _, rowcount = db.execute(
        f"UPDATE cancha SET {set_clause} WHERE nombre_cancha = %s AND id_complejo = %s", vals
    )
    if rowcount == 0:
        return jsonify({"error": "Cancha no encontrada"}), 404
    return jsonify({"message": "Cancha actualizada"})


@bp.route("/<int:id_complejo>/canchas/<nombre_cancha>", methods=["DELETE"])
@require_admin
def eliminar_cancha(id_complejo, nombre_cancha):
    _, rowcount = db.execute(
        "DELETE FROM cancha WHERE nombre_cancha = %s AND id_complejo = %s",
        (nombre_cancha, id_complejo),
    )
    if rowcount == 0:
        return jsonify({"error": "Cancha no encontrada"}), 404
    return jsonify({"message": "Cancha eliminada"})
