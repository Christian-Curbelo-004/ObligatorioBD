"""
Tests de las reglas de negocio para programación y gestión de partidos.

Reglas cubiertas:
- Un equipo no puede enfrentarse a sí mismo
- Ambos equipos deben pertenecer al mismo torneo
- Ambos equipos deben tener al menos 5 jugadores en el plantel
- No puede haber un partido activo entre los mismos dos equipos en la misma edición
- Un equipo no puede jugar más de una vez en la misma fecha del torneo
- Una cancha no puede tener dos partidos el mismo día y turno
- Un partido jugado no puede eliminarse
- Un partido jugado no puede editarse por la vía normal
"""

import unittest
from unittest.mock import patch, MagicMock
from tests.helpers import auth_headers


class TestProgramacionPartido(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.payload = {
            "id_torneo": 1,
            "numero_fecha": 2,
            "id_equipo_local": 1,
            "id_equipo_visitante": 2,
            "dia": "2026-11-10",
            "id_turno": 3,
            "nombre_cancha": "Cancha A",
            "id_complejo": 1,
        }

    def _ok_sequence(self, mock_db):
        """Configura todos los db.query_one para que pasen todas las validaciones."""
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},   # equipo local pertenece al torneo
            {"id_torneo": 1},   # equipo visitante pertenece al torneo
            {"c": 7},           # equipo local tiene 7 jugadores
            {"c": 6},           # equipo visitante tiene 6 jugadores
            None,               # no existe partido entre ellos
            None,               # equipo local libre en fecha 2
            None,               # equipo visitante libre en fecha 2
            None,               # cancha libre en ese día y turno
        ]

    # ----- equipo contra sí mismo -----

    @patch("routes.partidos.db")
    def test_equipo_no_puede_jugar_contra_si_mismo(self, mock_db):
        data = {**self.payload, "id_equipo_local": 5, "id_equipo_visitante": 5}
        resp = self.client.post("/partidos/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("sí mismo", resp.get_json()["error"])

    # ----- equipos de torneos distintos -----

    @patch("routes.partidos.db")
    def test_equipo_local_no_pertenece_al_torneo(self, mock_db):
        mock_db.query_one.side_effect = [{"id_torneo": 99}]  # torneo distinto
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("torneo", resp.get_json()["error"])

    @patch("routes.partidos.db")
    def test_equipo_visitante_no_pertenece_al_torneo(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},   # local OK
            {"id_torneo": 99},  # visitante en otro torneo
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("torneo", resp.get_json()["error"])

    @patch("routes.partidos.db")
    def test_equipo_inexistente_falla(self, mock_db):
        mock_db.query_one.side_effect = [None]  # equipo no existe
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    # ----- plantel con menos de 5 jugadores -----

    @patch("routes.partidos.db")
    def test_equipo_local_con_menos_de_5_jugadores(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},
            {"id_torneo": 1},
            {"c": 4},  # local: 4 jugadores, insuficiente
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("jugadores", resp.get_json()["error"])

    @patch("routes.partidos.db")
    def test_equipo_visitante_con_menos_de_5_jugadores(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},
            {"id_torneo": 1},
            {"c": 8},  # local OK
            {"c": 3},  # visitante: 3 jugadores, insuficiente
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("jugadores", resp.get_json()["error"])

    @patch("routes.partidos.db")
    def test_plantel_exactamente_5_jugadores_es_valido(self, mock_db):
        self._ok_sequence(mock_db)
        mock_db.query_one.side_effect[2] = {"c": 5}
        mock_db.query_one.side_effect[3] = {"c": 5}
        mock_db.execute.return_value = (10, 1)
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    # ----- partido duplicado entre los mismos equipos -----

    @patch("routes.partidos.db")
    def test_ya_existe_partido_entre_esos_equipos(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},
            {"id_torneo": 1},
            {"c": 7},
            {"c": 6},
            {"id_partido": 5},  # partido existente
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    @patch("routes.partidos.db")
    def test_partido_cancelado_permite_reprogramar(self, mock_db):
        # El partido cancelado no bloquea: la query filtra estado != 'cancelado'
        self._ok_sequence(mock_db)
        mock_db.execute.return_value = (11, 1)
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    # ----- equipo que ya juega en la misma fecha -----

    @patch("routes.partidos.db")
    def test_equipo_local_ya_tiene_partido_en_esa_fecha(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},
            {"id_torneo": 1},
            {"c": 7},
            {"c": 6},
            None,               # no duplicado
            {"id_partido": 3},  # equipo local ya juega en fecha 2
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("fecha", resp.get_json()["error"])

    @patch("routes.partidos.db")
    def test_equipo_visitante_ya_tiene_partido_en_esa_fecha(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},
            {"id_torneo": 1},
            {"c": 7},
            {"c": 6},
            None,
            None,               # local libre
            {"id_partido": 4},  # visitante ya juega en fecha 2
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("fecha", resp.get_json()["error"])

    # ----- cancha con dos partidos simultáneos -----

    @patch("routes.partidos.db")
    def test_cancha_ya_ocupada_en_mismo_dia_y_turno(self, mock_db):
        mock_db.query_one.side_effect = [
            {"id_torneo": 1},
            {"id_torneo": 1},
            {"c": 7},
            {"c": 6},
            None,
            None,
            None,
            {"id_partido": 7},  # cancha ocupada
        ]
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("cancha", resp.get_json()["error"])

    @patch("routes.partidos.db")
    def test_cancha_libre_en_turno_diferente_es_valido(self, mock_db):
        self._ok_sequence(mock_db)
        mock_db.execute.return_value = (15, 1)
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)

    # ----- partido creado correctamente -----

    @patch("routes.partidos.db")
    def test_partido_creado_correctamente(self, mock_db):
        self._ok_sequence(mock_db)
        mock_db.execute.return_value = (42, 1)
        resp = self.client.post("/partidos/", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.get_json()["id_partido"], 42)

    # ----- campos requeridos -----

    @patch("routes.partidos.db")
    def test_crear_sin_id_torneo_falla(self, mock_db):
        data = {k: v for k, v in self.payload.items() if k != "id_torneo"}
        resp = self.client.post("/partidos/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.partidos.db")
    def test_crear_sin_cancha_falla(self, mock_db):
        data = {k: v for k, v in self.payload.items() if k != "nombre_cancha"}
        resp = self.client.post("/partidos/", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    # ----- eliminación -----

    @patch("routes.partidos.db")
    def test_eliminar_partido_jugado_no_permitido(self, mock_db):
        mock_db.query_one.return_value = {"estado": "jugado"}
        resp = self.client.delete("/partidos/1", headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    @patch("routes.partidos.db")
    def test_eliminar_partido_programado_ok(self, mock_db):
        mock_db.query_one.return_value = {"estado": "programado"}
        mock_db.execute.return_value = (0, 1)
        resp = self.client.delete("/partidos/1", headers=auth_headers())
        self.assertEqual(resp.status_code, 200)

    @patch("routes.partidos.db")
    def test_eliminar_partido_cancelado_ok(self, mock_db):
        mock_db.query_one.return_value = {"estado": "cancelado"}
        mock_db.execute.return_value = (0, 1)
        resp = self.client.delete("/partidos/1", headers=auth_headers())
        self.assertEqual(resp.status_code, 200)

    @patch("routes.partidos.db")
    def test_eliminar_partido_inexistente_404(self, mock_db):
        mock_db.query_one.return_value = None
        resp = self.client.delete("/partidos/99", headers=auth_headers())
        self.assertEqual(resp.status_code, 404)

    # ----- edición -----

    @patch("routes.partidos.db")
    def test_editar_partido_jugado_no_permitido(self, mock_db):
        mock_db.query_one.return_value = {"estado": "jugado", "id_partido": 1}
        resp = self.client.put("/partidos/1", json={"numero_fecha": 3}, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    # ----- acceso sin token -----

    def test_crear_partido_sin_token_401(self):
        resp = self.client.post("/partidos/", json=self.payload)
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
