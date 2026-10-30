from functools import wraps
import jwt
from flask import request, jsonify, g
import config


def _decode(token):
    return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Token requerido"}), 401
        try:
            payload = _decode(auth.split(" ", 1)[1])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expirado"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Token inválido"}), 401
        g.user = payload
        return f(*args, **kwargs)
    return wrapper


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Token requerido"}), 401
        try:
            payload = _decode(auth.split(" ", 1)[1])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError) as e:
            return jsonify({"error": str(e)}), 401
        if payload.get("rol") != "administrador":
            return jsonify({"error": "Se requiere rol administrador"}), 403
        g.user = payload
        return f(*args, **kwargs)
    return wrapper
