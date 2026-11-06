"""
Tests de validación para el CRUD de jugadores.

Reglas cubiertas:
- ci, nombre, apellido y email son campos requeridos
- email debe contener '@'
- tipo debe ser uno de: grado, posgrado, docente, funcionario
- Solo administradores pueden gestionar jugadores
- CI duplicada devuelve 409
"""

import unittest
from unittest.mock import patch
from tests.helpers import auth_headers


class TestCrearJugador(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.jugador_valido = {
            "ci": "12345678",
            "nombre": "Juan",
            "apellido": "Perez",
            "email": "juan@test.com",
            "tipo": "grado",
            "id_facultad": 1,
        }

    @patch("routes.jugadores.db")
    def test_crear_jugador_valido_201(self, mock_db):
        mock_db.execute.return_value = (0, 1)
        resp = self.client.post("/jugadores/", json=self.jugador_valido, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    @patch("routes.jugadores.db")
    def test_sin_ci_400(self, mock_db):
        data = {k: v for k, v in self.jugador_valido.items() if k != "ci"}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_sin_nombre_400(self, mock_db):
        data = {**self.jugador_valido, "nombre": ""}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_sin_apellido_400(self, mock_db):
        data = {**self.jugador_valido, "apellido": "   "}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_email_sin_arroba_400(self, mock_db):
        data = {**self.jugador_valido, "email": "emailsinarroba.com"}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_email_vacio_400(self, mock_db):
        data = {**self.jugador_valido, "email": ""}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_tipo_invalido_400(self, mock_db):
        data = {**self.jugador_valido, "tipo": "visitante"}
        resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_todos_los_tipos_validos_aceptados(self, mock_db):
        mock_db.execute.return_value = (0, 1)
        for tipo in ("grado", "posgrado", "docente", "funcionario"):
            data = {**self.jugador_valido, "tipo": tipo, "ci": f"ci_{tipo}"}
            resp = self.client.post("/jugadores/", json=data, headers=auth_headers())
            self.assertEqual(resp.status_code, 201, f"tipo '{tipo}' debería ser aceptado")

    @patch("routes.jugadores.db")
    def test_ci_duplicada_409(self, mock_db):
        mock_db.execute.side_effect = Exception("Duplicate entry")
        resp = self.client.post("/jugadores/", json=self.jugador_valido, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    def test_crear_sin_token_401(self):
        resp = self.client.post("/jugadores/", json=self.jugador_valido)
        self.assertEqual(resp.status_code, 401)

    def test_planillero_no_puede_crear_jugador_403(self):
        resp = self.client.post("/jugadores/", json=self.jugador_valido, headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 403)


class TestActualizarJugador(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.jugadores.db")
    def test_actualizar_tipo_invalido_400(self, mock_db):
        resp = self.client.put("/jugadores/12345678", json={"tipo": "alien"}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_actualizar_email_sin_arroba_400(self, mock_db):
        resp = self.client.put("/jugadores/12345678", json={"email": "bademail"}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.jugadores.db")
    def test_actualizar_jugador_inexistente_404(self, mock_db):
        mock_db.execute.return_value = (0, 0)
        resp = self.client.put("/jugadores/99999999", json={"nombre": "Nuevo"}, headers=auth_headers())
        self.assertEqual(resp.status_code, 404)

    @patch("routes.jugadores.db")
    def test_actualizar_sin_campos_400(self, mock_db):
        resp = self.client.put("/jugadores/12345678", json={}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)


class TestEliminarJugador(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.jugadores.db")
    def test_eliminar_jugador_existente_200(self, mock_db):
        mock_db.execute.return_value = (0, 1)
        resp = self.client.delete("/jugadores/12345678", headers=auth_headers())
        self.assertEqual(resp.status_code, 200)

    @patch("routes.jugadores.db")
    def test_eliminar_jugador_inexistente_404(self, mock_db):
        mock_db.execute.return_value = (0, 0)
        resp = self.client.delete("/jugadores/99999999", headers=auth_headers())
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
