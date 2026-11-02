"""
Tests de validación para el CRUD de sanciones.

Reglas cubiertas:
- ci_jugador, id_torneo y numero_fecha_inicio son requeridos
- motivo debe ser uno de: roja, acumulacion_amarillas, disciplinaria
- cantidad_fechas debe ser >= 1
- Solo administradores pueden gestionar sanciones
- Sanción inexistente devuelve 404
"""

import unittest
from unittest.mock import patch
from tests.helpers import auth_headers


class TestCrearSancion(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.sancion_valida = {
            "ci_jugador": "12345678",
            "id_torneo": 1,
            "motivo": "disciplinaria",
            "numero_fecha_inicio": 3,
            "cantidad_fechas": 2,
        }

    @patch("routes.sanciones.db")
    def test_crear_sancion_valida_201(self, mock_db):
        mock_db.execute.return_value = (5, 1)
        resp = self.client.post("/sanciones/", json=self.sancion_valida, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.get_json()["id_sancion"], 5)

    @patch("routes.sanciones.db")
    def test_sin_ci_jugador_400(self, mock_db):
        data = {k: v for k, v in self.sancion_valida.items() if k != "ci_jugador"}
        resp = self.client.post("/sanciones/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.sanciones.db")
    def test_sin_id_torneo_400(self, mock_db):
        data = {k: v for k, v in self.sancion_valida.items() if k != "id_torneo"}
        resp = self.client.post("/sanciones/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.sanciones.db")
    def test_sin_numero_fecha_inicio_400(self, mock_db):
        data = {k: v for k, v in self.sancion_valida.items() if k != "numero_fecha_inicio"}
        resp = self.client.post("/sanciones/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.sanciones.db")
    def test_motivo_invalido_400(self, mock_db):
        data = {**self.sancion_valida, "motivo": "trampa"}
        resp = self.client.post("/sanciones/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.sanciones.db")
    def test_todos_los_motivos_validos_aceptados(self, mock_db):
        mock_db.execute.return_value = (1, 1)
        for motivo in ("roja", "acumulacion_amarillas", "disciplinaria"):
            data = {**self.sancion_valida, "motivo": motivo}
            resp = self.client.post("/sanciones/", json=data, headers=auth_headers())
            self.assertEqual(resp.status_code, 201, f"motivo '{motivo}' debería ser aceptado")

    @patch("routes.sanciones.db")
    def test_cantidad_fechas_cero_400(self, mock_db):
        data = {**self.sancion_valida, "cantidad_fechas": 0}
        resp = self.client.post("/sanciones/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    def test_crear_sin_token_401(self):
        resp = self.client.post("/sanciones/", json=self.sancion_valida)
        self.assertEqual(resp.status_code, 401)

    def test_planillero_no_puede_crear_sancion_403(self):
        resp = self.client.post("/sanciones/", json=self.sancion_valida, headers=auth_headers(rol="planillero"))
        self.assertEqual(resp.status_code, 403)


class TestObtenerSancion(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.sanciones.db")
    def test_obtener_sancion_existente_200(self, mock_db):
        mock_db.query_one.return_value = {"id_sancion": 1, "motivo": "roja"}
        resp = self.client.get("/sanciones/1", headers=auth_headers())
        self.assertEqual(resp.status_code, 200)

    @patch("routes.sanciones.db")
    def test_obtener_sancion_inexistente_404(self, mock_db):
        mock_db.query_one.return_value = None
        resp = self.client.get("/sanciones/99", headers=auth_headers())
        self.assertEqual(resp.status_code, 404)


class TestActualizarSancion(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.sanciones.db")
    def test_actualizar_motivo_invalido_400(self, mock_db):
        resp = self.client.put("/sanciones/1", json={"motivo": "verbal"}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.sanciones.db")
    def test_actualizar_sin_campos_400(self, mock_db):
        resp = self.client.put("/sanciones/1", json={}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.sanciones.db")
    def test_actualizar_sancion_inexistente_404(self, mock_db):
        mock_db.execute.return_value = (0, 0)
        resp = self.client.put("/sanciones/99", json={"cantidad_fechas": 3}, headers=auth_headers())
        self.assertEqual(resp.status_code, 404)

    @patch("routes.sanciones.db")
    def test_actualizar_cantidad_fechas_ok_200(self, mock_db):
        mock_db.execute.return_value = (0, 1)
        resp = self.client.put("/sanciones/1", json={"cantidad_fechas": 3}, headers=auth_headers())
        self.assertEqual(resp.status_code, 200)


class TestEliminarSancion(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    @patch("routes.sanciones.db")
    def test_eliminar_sancion_existente_200(self, mock_db):
        mock_db.execute.return_value = (0, 1)
        resp = self.client.delete("/sanciones/1", headers=auth_headers())
        self.assertEqual(resp.status_code, 200)

    @patch("routes.sanciones.db")
    def test_eliminar_sancion_inexistente_404(self, mock_db):
        mock_db.execute.return_value = (0, 0)
        resp = self.client.delete("/sanciones/99", headers=auth_headers())
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
