"""
Tests de las reglas de negocio para planillas, goles y tarjetas.

Reglas cubiertas:
- La planilla solo se puede registrar si el partido ya finalizó
- La planilla no puede registrarse dos veces (estado ya 'jugado')
- El jugador debe estar en el plantel del equipo participante
- El equipo del jugador debe ser uno de los dos del partido
- Un jugador suspendido no puede aparecer en la planilla
- Goles y tarjetas solo se pueden cargar si el partido está en estado 'jugado'
- Solo dentro del plazo de 48 h posteriores al partido
- El jugador debe estar en la planilla antes de poder registrar gol/tarjeta
- Tarjeta roja genera suspensión automática de 1 fecha
- Cada 3 amarillas acumuladas genera suspensión automática de 1 fecha
"""

import unittest
from unittest.mock import patch, MagicMock
from datetime import date, time, datetime, timedelta
from tests.helpers import auth_headers


# Partido base reutilizable
PARTIDO_JUGADO = {
    "id_partido": 1,
    "id_torneo": 1,
    "numero_fecha": 2,
    "id_equipo_local": 10,
    "id_equipo_visitante": 20,
    "dia": date(2026, 10, 1),
    "id_turno": 3,
    "estado": "jugado",
}

PARTIDO_PROGRAMADO = {**PARTIDO_JUGADO, "estado": "programado"}


class TestRegistrarPlanilla(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.payload = {
            "jugadores": [
                {"ci_jugador": "11111111", "id_equipo": 10},
                {"ci_jugador": "22222222", "id_equipo": 20},
            ]
        }

    @patch("routes.planillas.db")
    def test_partido_no_encontrado_404(self, mock_db):
        mock_db.query_one.return_value = None
        resp = self.client.post("/partidos/99/planilla/jugadores", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 404)

    @patch("routes.planillas.db")
    def test_planilla_ya_registrada_409(self, mock_db):
        mock_db.query_one.return_value = PARTIDO_JUGADO
        resp = self.client.post("/partidos/1/planilla/jugadores", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("ya fue registrada", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_partido_no_finalizado_409(self, mock_db):
        turno_futuro = {"hora_fin": (datetime.now() + timedelta(hours=2)).time()}
        mock_db.query_one.side_effect = [
            PARTIDO_PROGRAMADO,
            turno_futuro,  # _partido_jugable llama a db.query_one para el turno
        ]
        resp = self.client.post("/partidos/1/planilla/jugadores", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("no ha finalizado", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_sin_jugadores_400(self, mock_db):
        turno_pasado = {"hora_fin": (datetime.now() - timedelta(hours=2)).time()}
        mock_db.query_one.side_effect = [PARTIDO_PROGRAMADO, turno_pasado]
        resp = self.client.post("/partidos/1/planilla/jugadores", json={"jugadores": []}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.planillas.db")
    def test_jugador_no_en_plantel_409(self, mock_db):
        turno_pasado = {"hora_fin": (datetime.now() - timedelta(hours=2)).time()}
        mock_db.query_one.side_effect = [
            PARTIDO_PROGRAMADO,
            turno_pasado,        # _partido_jugable
            None,                # en_plantel → no está
        ]
        data = {"jugadores": [{"ci_jugador": "11111111", "id_equipo": 10}]}
        resp = self.client.post("/partidos/1/planilla/jugadores", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("plantel", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_equipo_no_participa_en_partido_409(self, mock_db):
        turno_pasado = {"hora_fin": (datetime.now() - timedelta(hours=2)).time()}
        mock_db.query_one.side_effect = [
            PARTIDO_PROGRAMADO,
            turno_pasado,
            {"1": 1},  # sí está en plantel
        ]
        data = {"jugadores": [{"ci_jugador": "11111111", "id_equipo": 99}]}  # equipo 99 no juega
        resp = self.client.post("/partidos/1/planilla/jugadores", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("no participa", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_jugador_suspendido_409(self, mock_db):
        turno_pasado = {"hora_fin": (datetime.now() - timedelta(hours=2)).time()}
        mock_db.query_one.side_effect = [
            PARTIDO_PROGRAMADO,
            turno_pasado,
            {"1": 1},   # en plantel
            {"1": 1},   # está suspendido
        ]
        data = {"jugadores": [{"ci_jugador": "11111111", "id_equipo": 10}]}
        resp = self.client.post("/partidos/1/planilla/jugadores", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("suspendido", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_registro_exitoso_201(self, mock_db):
        turno_pasado = {"hora_fin": (datetime.now() - timedelta(hours=2)).time()}
        mock_db.query_one.side_effect = [
            PARTIDO_PROGRAMADO,
            turno_pasado,
            {"1": 1},   # en plantel equipo local
            None,       # no suspendido
            {"1": 1},   # en plantel equipo visitante
            None,       # no suspendido
        ]
        mock_db.execute_many.return_value = None
        data = {"jugadores": [
            {"ci_jugador": "11111111", "id_equipo": 10},
            {"ci_jugador": "22222222", "id_equipo": 20},
        ]}
        resp = self.client.post("/partidos/1/planilla/jugadores", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)


class TestRegistrarGol(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()
        self.payload = {"ci_jugador": "11111111", "minuto": 23}

    def _turno_dentro_plazo(self):
        return {"hora_fin": (datetime.now() - timedelta(hours=1)).time()}

    def _turno_fuera_plazo(self):
        return {"hora_fin": (datetime.now() - timedelta(hours=50)).time()}

    @patch("routes.planillas.db")
    def test_partido_no_jugado_409(self, mock_db):
        mock_db.query_one.return_value = PARTIDO_PROGRAMADO
        resp = self.client.post("/partidos/1/goles", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("jugado", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_fuera_del_plazo_48h_409(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_fuera_plazo(),  # _dentro_plazo_correccion
        ]
        resp = self.client.post("/partidos/1/goles", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("plazo", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_jugador_no_en_planilla_409(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
            None,  # no está en planilla
        ]
        resp = self.client.post("/partidos/1/goles", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)
        self.assertIn("planilla", resp.get_json()["error"])

    @patch("routes.planillas.db")
    def test_gol_registrado_correctamente_201(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
            {"1": 1},  # en planilla
        ]
        mock_db.execute.return_value = (7, 1)
        resp = self.client.post("/partidos/1/goles", json=self.payload, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.get_json()["id_gol"], 7)

    @patch("routes.planillas.db")
    def test_sin_ci_jugador_400(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
        ]
        resp = self.client.post("/partidos/1/goles", json={"minuto": 10}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.planillas.db")
    def test_sin_minuto_400(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
        ]
        resp = self.client.post("/partidos/1/goles", json={"ci_jugador": "11111111"}, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)


class TestRegistrarTarjeta(unittest.TestCase):

    def setUp(self):
        from app import app
        self.client = app.test_client()

    def _turno_dentro_plazo(self):
        return {"hora_fin": (datetime.now() - timedelta(hours=1)).time()}

    @patch("routes.planillas.db")
    def test_color_invalido_400(self, mock_db):
        mock_db.query_one.side_effect = [PARTIDO_JUGADO, self._turno_dentro_plazo()]
        data = {"ci_jugador": "11111111", "minuto": 35, "color": "azul"}
        resp = self.client.post("/partidos/1/tarjetas", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 400)

    @patch("routes.planillas.db")
    def test_jugador_no_en_planilla_409(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
            None,  # no en planilla
        ]
        data = {"ci_jugador": "11111111", "minuto": 35, "color": "amarilla"}
        resp = self.client.post("/partidos/1/tarjetas", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 409)

    @patch("routes.planillas.db")
    def test_tarjeta_roja_genera_sancion_automatica(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
            {"1": 1},  # en planilla
        ]
        mock_db.execute.return_value = (3, 1)  # INSERT tarjeta
        data = {"ci_jugador": "11111111", "minuto": 60, "color": "roja"}
        resp = self.client.post("/partidos/1/tarjetas", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        # Debe haberse llamado execute dos veces: tarjeta + sanción automática
        self.assertEqual(mock_db.execute.call_count, 2)

    @patch("routes.planillas.db")
    def test_tercera_amarilla_genera_sancion_automatica(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
            {"1": 1},          # en planilla
            {"c": 3},          # 3 amarillas acumuladas → múltiplo de 3
        ]
        mock_db.execute.return_value = (4, 1)
        data = {"ci_jugador": "11111111", "minuto": 55, "color": "amarilla"}
        resp = self.client.post("/partidos/1/tarjetas", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(mock_db.execute.call_count, 2)  # tarjeta + sanción

    @patch("routes.planillas.db")
    def test_segunda_amarilla_no_genera_sancion(self, mock_db):
        mock_db.query_one.side_effect = [
            PARTIDO_JUGADO,
            self._turno_dentro_plazo(),
            {"1": 1},
            {"c": 2},  # 2 amarillas, no es múltiplo de 3
        ]
        mock_db.execute.return_value = (5, 1)
        data = {"ci_jugador": "11111111", "minuto": 40, "color": "amarilla"}
        resp = self.client.post("/partidos/1/tarjetas", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(mock_db.execute.call_count, 1)  # solo la tarjeta

    @patch("routes.planillas.db")
    def test_tarjeta_roja_registrada_correctamente(self, mock_db):
        mock_db.query_one.side_effect = [PARTIDO_JUGADO, self._turno_dentro_plazo(), {"1": 1}]
        mock_db.execute.return_value = (8, 1)
        data = {"ci_jugador": "11111111", "minuto": 80, "color": "roja"}
        resp = self.client.post("/partidos/1/tarjetas", json=data, headers=auth_headers())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.get_json()["id_tarjeta"], 8)

    def test_registrar_tarjeta_sin_token_401(self):
        data = {"ci_jugador": "11111111", "minuto": 30, "color": "amarilla"}
        resp = self.client.post("/partidos/1/tarjetas", json=data)
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
