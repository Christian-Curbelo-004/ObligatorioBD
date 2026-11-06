"""
Tests de autenticación y control de acceso basado en rol.

Reglas cubiertas:
- Login exitoso devuelve token JWT con rol
- Credenciales incorrectas devuelven 401
- Campos faltantes en login devuelven 400
- Rutas protegidas rechazan peticiones sin token (401)
- Planillero no puede acceder a rutas de administrador (403)
- Administrador puede acceder a cualquier ruta
- Token inválido es rechazado (401)
- Token con rol inválido es rechazado en rutas de admin (403)
"""

import unittest
from unittest.mock import patch
from werkzeug.security import generate_password_hash
from tests.helpers import auth_headers, make_token
import jwt
import config


class TestLogin(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.auth.db")
    def test_login_exitoso_devuelve_token(self, mock_db):
        mock_db.query_one.return_value = {
            "correo": "admin@test.com",
            "password_hash": generate_password_hash("secreto"),
            "rol": "administrador",
        }
        resp = self.client.post("/auth/login", json={"correo": "admin@test.com", "password": "secreto"})
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertIn("token", body)
        self.assertEqual(body["rol"], "administrador")

    @patch("routes.auth.db")
    def test_login_password_incorrecto_401(self, mock_db):
        mock_db.query_one.return_value = {
            "correo": "admin@test.com",
            "password_hash": generate_password_hash("correcto"),
            "rol": "administrador",
        }
        resp = self.client.post("/auth/login", json={"correo": "admin@test.com", "password": "incorrecto"})
        self.assertEqual(resp.status_code, 401)

    @patch("routes.auth.db")
    def test_login_usuario_inexistente_401(self, mock_db):
        mock_db.query_one.return_value = None
        resp = self.client.post("/auth/login", json={"correo": "noexiste@test.com", "password": "x"})
        self.assertEqual(resp.status_code, 401)

    def test_login_sin_correo_400(self):
        resp = self.client.post("/auth/login", json={"password": "x"})
        self.assertEqual(resp.status_code, 400)

    def test_login_sin_password_400(self):
        resp = self.client.post("/auth/login", json={"correo": "a@b.com"})
        self.assertEqual(resp.status_code, 400)

    def test_login_sin_cuerpo_400(self):
        resp = self.client.post("/auth/login", json={})
        self.assertEqual(resp.status_code, 400)

    @patch("routes.auth.db")
    def test_token_contiene_rol_planillero(self, mock_db):
        mock_db.query_one.return_value = {
            "correo": "p@test.com",
            "password_hash": generate_password_hash("pw"),
            "rol": "planillero",
        }
        resp = self.client.post("/auth/login", json={"correo": "p@test.com", "password": "pw"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["rol"], "planillero")


class TestRegistro(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.auth.db")
    def test_registro_exitoso_201(self, mock_db):
        mock_db.execute.return_value = (1, 1)
        resp = self.client.post("/auth/register", json={"correo": "new@test.com", "password": "pw123", "rol": "planillero"})
        self.assertEqual(resp.status_code, 201)

    def test_registro_rol_invalido_400(self):
        resp = self.client.post("/auth/register", json={"correo": "x@test.com", "password": "pw", "rol": "superadmin"})
        self.assertEqual(resp.status_code, 400)

    @patch("routes.auth.db")
    def test_registro_correo_duplicado_409(self, mock_db):
        mock_db.execute.side_effect = Exception("Duplicate entry")
        resp = self.client.post("/auth/register", json={"correo": "dup@test.com", "password": "pw"})
        self.assertEqual(resp.status_code, 409)


class TestControlAcceso(unittest.TestCase):
    """Verifica que las rutas apliquen correctamente el control de acceso por rol."""

    def setUp(self):
        from app import app
        self.client = app.test_client()

    # ----- sin token -----

    def test_ruta_admin_sin_token_401(self):
        resp = self.client.get("/jugadores/")
        self.assertEqual(resp.status_code, 401)

    def test_ruta_auth_sin_token_401(self):
        resp = self.client.get("/torneos/")
        self.assertEqual(resp.status_code, 401)

    # ----- token inválido -----

    def test_token_malformado_401(self):
        headers = {"Authorization": "Bearer token.invalido.aqui", "Content-Type": "application/json"}
        resp = self.client.get("/jugadores/", headers=headers)
        self.assertEqual(resp.status_code, 401)

    def test_token_firmado_con_clave_incorrecta_401(self):
        token = jwt.encode({"correo": "x@test.com", "rol": "administrador"}, "clave_falsa", algorithm="HS256")
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        resp = self.client.get("/jugadores/", headers=headers)
        self.assertEqual(resp.status_code, 401)

    # ----- planillero vs administrador -----

    def test_planillero_no_puede_acceder_a_jugadores_403(self):
        resp = self.client.get("/jugadores/", headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 403)

    def test_planillero_no_puede_crear_jugador_403(self):
        data = {"ci": "12345678", "nombre": "A", "apellido": "B", "email": "a@b.com", "tipo": "grado"}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 403)

    def test_planillero_no_puede_crear_sancion_403(self):
        data = {"ci_jugador": "12345678", "id_torneo": 1, "motivo": "disciplinaria", "numero_fecha_inicio": 1}
        resp = self.client.post("/sanciones/", json=data, headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 403)

    @patch("routes.jugadores.db")
    def test_administrador_puede_listar_jugadores_200(self, mock_db):
        mock_db.query_all.return_value = []
        resp = self.client.get("/jugadores/", headers=auth_headers(rol="administrador"))
        self.assertEqual(resp.status_code, 200)

    # ----- rutas accesibles para planillero (requieren auth, no admin) -----

    @patch("routes.torneos.db")
    def test_planillero_puede_listar_torneos_200(self, mock_db):
        mock_db.query_all.return_value = []
        resp = self.client.get("/torneos/", headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 200)

    @patch("routes.partidos.db")
    def test_planillero_puede_listar_partidos_200(self, mock_db):
        mock_db.query_all.return_value = []
        resp = self.client.get("/partidos/", headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
