from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash, generate_password_hash
import jwt
import db
import config

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    correo = data.get("correo", "").strip()
    password = data.get("password", "")

    if not correo or not password:
        return jsonify({"error": "correo y password requeridos"}), 400

    user = db.query_one("SELECT * FROM login WHERE correo = %s", (correo,))
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Credenciales inválidas"}), 401

    exp = datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXP_H)
    token = jwt.encode(
        {"correo": user["correo"], "rol": user["rol"], "exp": exp},
        config.JWT_SECRET,
        algorithm="HS256",
    )
    return jsonify({"token": token, "rol": user["rol"]})


@bp.route("/register", methods=["POST"])
def register():
    """Solo para setup inicial; en producción deshabilitar o proteger."""
    data = request.get_json(silent=True) or {}
    correo = data.get("correo", "").strip()
    password = data.get("password", "")
    rol = data.get("rol", "planillero")

    if not correo or not password:
        return jsonify({"error": "correo y password requeridos"}), 400
    if rol not in ("administrador", "planillero"):
        return jsonify({"error": "rol inválido"}), 400

    hashed = generate_password_hash(password)
    try:
        db.execute(
            "INSERT INTO login (correo, password_hash, rol) VALUES (%s, %s, %s)",
            (correo, hashed, rol),
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 409

    return jsonify({"message": "Usuario creado"}), 201
