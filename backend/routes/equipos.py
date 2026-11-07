from flask import Blueprint, request, jsonify
import db
from middleware.auth import require_admin, require_auth

bp = Blueprint("equipos", __name__, url_prefix="/equipos")

MAX_DOCENTES_FUNCIONARIOS = 2
MIN_JUGADORES = 5
MAX_JUGADORES = 10
_CAMPOS_UPDATE = {"nombre", "ci_capitan"}


@bp.route("/", methods=["GET"])
@require_auth
def listar():
    return jsonify(db.query_all(
        "SELECT e.*, f.nombre AS nombre_facultad, t.nombre AS nombre_torneo "
        "FROM equipo e "
        "JOIN facultad f ON e.id_facultad = f.id_facultad "
        "JOIN torneo t ON e.id_torneo = t.id_torneo"
    ))


@bp.route("/<int:id_equipo>", methods=["GET"])
@require_auth
def obtener(id_equipo):
    row = db.query_one(
        "SELECT e.*, f.nombre AS nombre_facultad FROM equipo e "
        "JOIN facultad f ON e.id_facultad = f.id_facultad WHERE e.id_equipo = %s",
        (id_equipo,),
    )
    if not row:
        return jsonify({"error": "Equipo no encontrado"}), 404
    return jsonify(row)


@bp.route("/", methods=["POST"])
@require_admin
def crear():
    data = request.get_json(silent=True) or {}
    nombre = data.get("nombre", "").strip()
    id_torneo = data.get("id_torneo")
    id_facultad = data.get("id_facultad")

    if not nombre or not id_torneo or not id_facultad:
        return jsonify({"error": "nombre, id_torneo e id_facultad requeridos"}), 400

    torneo = db.query_one("SELECT estado FROM torneo WHERE id_torneo = %s", (id_torneo,))
    if not torneo:
        return jsonify({"error": "Torneo no encontrado"}), 404
    if torneo["estado"] != "inscripcion":
        return jsonify({"error": "Solo se pueden crear equipos en etapa inscripcion"}), 409

    lastrowid, _ = db.execute(
        "INSERT INTO equipo (nombre, id_torneo, id_facultad) VALUES (%s, %s, %s)",
        (nombre, id_torneo, id_facultad),
    )
    return jsonify({"id_equipo": lastrowid, "message": "Equipo creado"}), 201


@bp.route("/<int:id_equipo>", methods=["PUT"])
@require_admin
def actualizar(id_equipo):
    data = request.get_json(silent=True) or {}
    campos = {k: v for k, v in data.items() if k in _CAMPOS_UPDATE}
    if not campos:
        return jsonify({"error": "Sin campos válidos para actualizar"}), 400

    set_clause = ", ".join(f"{k} = %s" for k in campos)
    vals = list(campos.values()) + [id_equipo]
    _, rowcount = db.execute(
        f"UPDATE equipo SET {set_clause} WHERE id_equipo = %s", vals
    )
    if rowcount == 0:
        return jsonify({"error": "Equipo no encontrado"}), 404
    return jsonify({"message": "Equipo actualizado"})


@bp.route("/<int:id_equipo>", methods=["DELETE"])
@require_admin
def eliminar(id_equipo):
    _, rowcount = db.execute("DELETE FROM equipo WHERE id_equipo = %s", (id_equipo,))
    if rowcount == 0:
        return jsonify({"error": "Equipo no encontrado"}), 404
    return jsonify({"message": "Equipo eliminado"})


# --- Planteles ---

@bp.route("/<int:id_equipo>/plantel", methods=["GET"])
@require_auth
def ver_plantel(id_equipo):
    rows = db.query_all(
        "SELECT ejt.*, j.nombre, j.apellido, j.tipo "
        "FROM equipo_jugador_torneo ejt "
        "JOIN jugador j ON ejt.ci_jugador = j.ci "
        "WHERE ejt.id_equipo = %s",
        (id_equipo,),
    )
    return jsonify(rows)


@bp.route("/<int:id_equipo>/plantel", methods=["POST"])
@require_admin
def agregar_jugador(id_equipo):
    data = request.get_json(silent=True) or {}
    ci_jugador = data.get("ci_jugador", "").strip()
    numero_camiseta = data.get("numero_camiseta")

    if not ci_jugador:
        return jsonify({"error": "ci_jugador requerido"}), 400

    equipo = db.query_one(
        "SELECT e.id_torneo, e.id_facultad, t.estado "
        "FROM equipo e JOIN torneo t ON e.id_torneo = t.id_torneo "
        "WHERE e.id_equipo = %s",
        (id_equipo,),
    )
    if not equipo:
        return jsonify({"error": "Equipo no encontrado"}), 404
    if equipo["estado"] != "inscripcion":
        return jsonify({"error": "El plantel solo se puede modificar en etapa inscripcion"}), 409

    jugador = db.query_one(
        "SELECT tipo, id_facultad FROM jugador WHERE ci = %s", (ci_jugador,)
    )
    if not jugador:
        return jsonify({"error": "Jugador no encontrado"}), 404
    if jugador["id_facultad"] != equipo["id_facultad"]:
        return jsonify({"error": "El jugador no pertenece a la facultad del equipo"}), 409

    # Verificar que no esté en otro equipo de la misma edición
    en_otro = db.query_one(
        "SELECT 1 FROM equipo_jugador_torneo WHERE ci_jugador = %s AND id_torneo = %s AND id_equipo != %s",
        (ci_jugador, equipo["id_torneo"], id_equipo),
    )
    if en_otro:
        return jsonify({"error": "El jugador ya está en otro equipo de esta edición"}), 409

    # Límite de docentes/funcionarios
    if jugador["tipo"] in ("docente", "funcionario"):
        count = db.query_one(
            "SELECT COUNT(*) AS c FROM equipo_jugador_torneo ejt "
            "JOIN jugador j ON ejt.ci_jugador = j.ci "
            "WHERE ejt.id_equipo = %s AND j.tipo IN ('docente','funcionario')",
            (id_equipo,),
        )
        if count["c"] >= MAX_DOCENTES_FUNCIONARIOS:
            return jsonify({"error": "Máximo 2 docentes/funcionarios por equipo"}), 409

    # Límite de jugadores en plantel
    total = db.query_one(
        "SELECT COUNT(*) AS c FROM equipo_jugador_torneo WHERE id_equipo = %s", (id_equipo,)
    )
    if total["c"] >= MAX_JUGADORES:
        return jsonify({"error": f"Máximo {MAX_JUGADORES} jugadores por equipo"}), 409

    try:
        db.execute(
            "INSERT INTO equipo_jugador_torneo (id_equipo, ci_jugador, id_torneo, numero_camiseta) "
            "VALUES (%s, %s, %s, %s)",
            (id_equipo, ci_jugador, equipo["id_torneo"], numero_camiseta),
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 409

    return jsonify({"message": "Jugador agregado al plantel"}), 201


@bp.route("/<int:id_equipo>/plantel/<ci_jugador>", methods=["DELETE"])
@require_admin
def quitar_jugador(id_equipo, ci_jugador):
    equipo = db.query_one(
        "SELECT t.estado FROM equipo e JOIN torneo t ON e.id_torneo = t.id_torneo "
        "WHERE e.id_equipo = %s",
        (id_equipo,),
    )
    if not equipo:
        return jsonify({"error": "Equipo no encontrado"}), 404
    if equipo["estado"] != "inscripcion":
        return jsonify({"error": "El plantel solo se puede modificar en etapa inscripcion"}), 409

    _, rowcount = db.execute(
        "DELETE FROM equipo_jugador_torneo WHERE id_equipo = %s AND ci_jugador = %s",
        (id_equipo, ci_jugador),
    )
    if rowcount == 0:
        return jsonify({"error": "Jugador no está en el plantel"}), 404
    return jsonify({"message": "Jugador quitado del plantel"})
