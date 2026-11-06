"""
Tests de las reglas de negocio para gestión de equipos y planteles.

Reglas cubiertas:
- Solo se pueden crear equipos en etapa de inscripción
- El plantel solo se puede modificar en etapa de inscripción
- El jugador debe pertenecer a la facultad del equipo
- Un jugador no puede estar en más de un equipo en la misma edición
- Máximo 2 docentes/funcionarios por equipo
- Máximo 10 jugadores en el plantel
"""

import unittest
from unittest.mock import patch
from tests.helpers import auth_headers


class TestCrearEquipo(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.payload = {"nombre": "Los Tigres", "id_torneo": 1, "id_facultad": 2}

    @patch("routes.equipos.db")
    def test_crear_equipo_en_inscripcion_ok(self, mock_db):
        mock_db.query_one.return_value = {"estado": "inscripcion"}
        mock_db.execute.return_value = (5, 1)
        resp = self.client.post("/equipos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    @patch("routes.equipos.db")
    def test_crear_equipo_torneo_en_curso_falla(self, mock_db):
        mock_db.query_one.return_value = {"estado": "en_curso"}
        resp = self.client.post("/equipos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("inscripcion", resp.get_json()["error"])

    @patch("routes.equipos.db")
    def test_crear_equipo_torneo_finalizado_falla(self, mock_db):
        mock_db.query_one.return_value = {"estado": "finalizado"}
        resp = self.client.post("/equipos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    @patch("routes.equipos.db")
    def test_crear_equipo_sin_nombre_falla(self, mock_db):
        data = {"id_torneo": 1, "id_facultad": 2}
        resp = self.client.post("/equipos/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.equipos.db")
    def test_crear_equipo_torneo_inexistente_falla(self, mock_db):
        mock_db.query_one.return_value = None
        resp = self.client.post("/equipos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 404)


class TestAgregarJugadorPlantel(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.payload = {"ci_jugador": "12345678", "numero_camiseta": 9}

    def _equipo_inscripcion(self, id_facultad=2, id_torneo=1):
        return {"id_torneo": id_torneo, "id_facultad": id_facultad, "estado": "inscripcion"}

    # ----- torneo no en inscripción -----

    @patch("routes.equipos.db")
    def test_agregar_jugador_torneo_en_curso_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1, "id_facultad": 2, "estado": "en_curso"}
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("inscripcion", resp.get_json()["error"])

    @patch("routes.equipos.db")
    def test_agregar_jugador_torneo_finalizado_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1, "id_facultad": 2, "estado": "finalizado"}
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    # ----- jugador de facultad diferente -----

    @patch("routes.equipos.db")
    def test_jugador_de_otra_facultad_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(id_facultad=2),
            {"tipo": "grado", "id_facultad": 99},  # facultad diferente
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("facultad", resp.get_json()["error"])

    @patch("routes.equipos.db")
    def test_jugador_inexistente_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            None,  # jugador no encontrado
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 404)

    # ----- jugador en otro equipo de la misma edición -----

    @patch("routes.equipos.db")
    def test_jugador_ya_en_otro_equipo_misma_edicion_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            {"tipo": "grado", "id_facultad": 2},
            {"1": 1},  # ya está en otro equipo
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("otro equipo", resp.get_json()["error"])

    # ----- límite de docentes/funcionarios -----

    @patch("routes.equipos.db")
    def test_tercer_docente_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            {"tipo": "docente", "id_facultad": 2},
            None,            # no está en otro equipo
            {"c": 2},        # ya hay 2 docentes/funcionarios
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("2", resp.get_json()["error"])

    @patch("routes.equipos.db")
    def test_segundo_docente_es_valido(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            {"tipo": "docente", "id_facultad": 2},
            None,       # no en otro equipo
            {"c": 1},   # solo hay 1 docente/funcionario
            {"c": 7},   # plantel tiene 7 jugadores (< 10)
        ]
        mock_db.execute.return_value = (0, 1)
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    @patch("routes.equipos.db")
    def test_funcionario_cuenta_como_docente_para_limite(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            {"tipo": "funcionario", "id_facultad": 2},
            None,
            {"c": 2},  # ya hay 2 entre docentes y funcionarios
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    # ----- límite máximo del plantel -----

    @patch("routes.equipos.db")
    def test_plantel_lleno_10_jugadores_falla(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            {"tipo": "grado", "id_facultad": 2},
            None,
            {"c": 10},  # plantel lleno
        ]
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("10", resp.get_json()["error"])

    @patch("routes.equipos.db")
    def test_plantel_con_9_jugadores_acepta_uno_mas(self, mock_db):
        mock_db.query_one.side_effect = [
            self._equipo_inscripcion(),
            {"tipo": "grado", "id_facultad": 2},
            None,
            {"c": 9},  # todavía hay lugar
        ]
        mock_db.execute.return_value = (0, 1)
        resp = self.client.post("/equipos/1/plantel", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    # ----- quitar jugador -----

    @patch("routes.equipos.db")
    def test_quitar_jugador_torneo_en_curso_falla(self, mock_db):
        mock_db.query_one.return_value = {"estado": "en_curso"}
        resp = self.client.delete("/equipos/1/plantel/12345678", headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    @patch("routes.equipos.db")
    def test_quitar_jugador_inexistente_del_plantel_404(self, mock_db):
        mock_db.query_one.return_value = {"estado": "inscripcion"}
        mock_db.execute.return_value = (0, 0)  # rowcount = 0
        resp = self.client.delete("/equipos/1/plantel/99999999", headers=auth_headers())
        self.assertEqual(resp.status_code, 404)

    # ----- sin ci_jugador -----

    @patch("routes.equipos.db")
    def test_agregar_sin_ci_falla(self, mock_db):
        resp = self.client.post("/equipos/1/plantel", json={}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    # ----- acceso sin token -----

    def test_agregar_jugador_sin_token_401(self):
        resp = self.client.post("/equipos/1/plantel", json=self.payload)
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
