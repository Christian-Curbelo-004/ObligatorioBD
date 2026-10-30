from flask import Flask, jsonify
from routes import auth, jugadores, equipos, torneos, complejos, partidos, planillas, sanciones, reportes, facultades

app = Flask(__name__)


def _register_blueprints():
    app.register_blueprint(auth.bp)
    app.register_blueprint(facultades.bp)
    app.register_blueprint(jugadores.bp)
    app.register_blueprint(torneos.bp)
    app.register_blueprint(equipos.bp)
    app.register_blueprint(complejos.bp)
    app.register_blueprint(partidos.bp)
    app.register_blueprint(planillas.bp)
    app.register_blueprint(sanciones.bp)
    app.register_blueprint(reportes.bp)


_register_blueprints()


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Recurso no encontrado"}), 404


@app.errorhandler(405)
def method_not_allowed(_):
    return jsonify({"error": "Método no permitido"}), 405


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Error interno del servidor", "detail": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
