-- =====================================================================
-- 07_usuarios.sql
-- USUARIOS DE BASE DE DATOS Y PERMISOS DIFERENCIADOS
-- Requiere 01 a 06 ya ejecutados
-- =====================================================================

CREATE USER IF NOT EXISTS 'app_admin'@'%'      IDENTIFIED BY 'Admin_2026_cambiar';
CREATE USER IF NOT EXISTS 'app_planillero'@'%' IDENTIFIED BY 'Planillero_2026_cambiar';
CREATE USER IF NOT EXISTS 'app_auth'@'%'       IDENTIFIED BY 'Auth_2026_cambiar';

-- Administrador: gestiona los datos, sin cambiar la estructura
GRANT SELECT, INSERT, UPDATE, DELETE ON proyecto_bd.* TO 'app_admin'@'%';

-- Planillero: lectura de lo necesario
GRANT SELECT ON proyecto_bd.facultad              TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.jugador               TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.torneo                TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.equipo                TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.equipo_jugador_torneo TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.complejo              TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.cancha                TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.turno                 TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.partido               TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.sancion_jugador       TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.vw_resultado_partido  TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.vw_equipo_resultado   TO 'app_planillero'@'%';
GRANT SELECT ON proyecto_bd.vw_tabla_posiciones   TO 'app_planillero'@'%';

-- Planillero: registro de planilla, goles y tarjetas
GRANT SELECT, INSERT, DELETE         ON proyecto_bd.planilla_partido TO 'app_planillero'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON proyecto_bd.gol              TO 'app_planillero'@'%';
GRANT SELECT, INSERT, DELETE         ON proyecto_bd.tarjeta          TO 'app_planillero'@'%';

-- Planillero: solo puede cambiar la columna estado del partido
GRANT UPDATE (estado) ON proyecto_bd.partido TO 'app_planillero'@'%';

-- Autenticacion: solo lee login
GRANT SELECT ON proyecto_bd.login TO 'app_auth'@'%';

