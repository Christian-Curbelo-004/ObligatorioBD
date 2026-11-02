-- =====================================================================
-- 04_datos_prueba.sql
-- 6 equipos, 42 jugadores, 16 partidos, planillas, goles, tarjetas, sanciones
-- Requiere 01, 02 y 03 ya ejecutados. Va ANTES del 05 (ventana de 48 h).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. PREPARACION: el plantel solo se carga en inscripcion
-- ---------------------------------------------------------------------
UPDATE torneo
SET estado = 'inscripcion', fecha_inicio = '2026-09-14', fecha_fin = '2026-12-04'
WHERE id_torneo = 1;

-- ---------------------------------------------------------------------
-- 1. JUGADORES (ci = 5 + id_equipo + 000000 + camiseta)
-- Camisetas 1 a 6 juegan; la 7 de cada equipo nunca figura en una planilla
-- Maximo 2 docentes/funcionarios por equipo
-- ---------------------------------------------------------------------
INSERT INTO jugador (ci, nombre, apellido, email, fecha_nacimiento, id_facultad, tipo) VALUES
    -- Ingenieria (facultad 1)
    ('51000001','Mateo','Silva','mateo.silva@ucu.edu.uy','2003-04-12',1,'grado'),
    ('51000002','Lucas','Pereira','lucas.pereira@ucu.edu.uy','2002-08-30',1,'grado'),
    ('51000003','Bruno','Rodriguez','bruno.rodriguez@ucu.edu.uy','2004-01-15',1,'grado'),
    ('51000004','Diego','Fernandez','diego.fernandez@ucu.edu.uy','2003-11-02',1,'grado'),
    ('51000005','Nicolas','Gomez','nicolas.gomez@ucu.edu.uy','1998-06-21',1,'posgrado'),
    ('51000006','Ricardo','Suarez','ricardo.suarez@ucu.edu.uy','1981-03-09',1,'docente'),
    ('51000007','Alberto','Cabrera','alberto.cabrera@ucu.edu.uy','1985-09-17',1,'funcionario'),
    -- Derecho (facultad 2)
    ('52000001','Santiago','Martinez','santiago.martinez@ucu.edu.uy','2003-02-14',2,'grado'),
    ('52000002','Joaquin','Lopez','joaquin.lopez@ucu.edu.uy','2002-12-05',2,'grado'),
    ('52000003','Agustin','Garcia','agustin.garcia@ucu.edu.uy','2004-05-27',2,'grado'),
    ('52000004','Franco','Sosa','franco.sosa@ucu.edu.uy','2003-07-19',2,'grado'),
    ('52000005','Emiliano','Diaz','emiliano.diaz@ucu.edu.uy','1999-10-03',2,'posgrado'),
    ('52000006','Gonzalo','Acosta','gonzalo.acosta@ucu.edu.uy','2002-09-08',2,'grado'),
    ('52000007','Hector','Mendez','hector.mendez@ucu.edu.uy','1978-01-25',2,'docente'),
    -- Medicina (facultad 3)
    ('53000001','Tomas','Romero','tomas.romero@ucu.edu.uy','2003-03-11',3,'grado'),
    ('53000002','Matias','Castro','matias.castro@ucu.edu.uy','2002-06-23',3,'grado'),
    ('53000003','Facundo','Ruiz','facundo.ruiz@ucu.edu.uy','2004-02-09',3,'grado'),
    ('53000004','Ignacio','Torres','ignacio.torres@ucu.edu.uy','2003-08-14',3,'grado'),
    ('53000005','Pablo','Vazquez','pablo.vazquez@ucu.edu.uy','1997-12-30',3,'posgrado'),
    ('53000006','Marcelo','Ibarra','marcelo.ibarra@ucu.edu.uy','1983-04-06',3,'funcionario'),
    ('53000007','Julio','Benitez','julio.benitez@ucu.edu.uy','1976-10-12',3,'docente'),
    -- Psicologia (facultad 4)
    ('54000001','Sebastian','Ramos','sebastian.ramos@ucu.edu.uy','2003-09-01',4,'grado'),
    ('54000002','Maximo','Correa','maximo.correa@ucu.edu.uy','2002-04-18',4,'grado'),
    ('54000003','Leandro','Nunez','leandro.nunez@ucu.edu.uy','2004-06-13',4,'grado'),
    ('54000004','Andres','Molina','andres.molina@ucu.edu.uy','2003-01-29',4,'grado'),
    ('54000005','Rodrigo','Silveira','rodrigo.silveira@ucu.edu.uy','2002-11-22',4,'grado'),
    ('54000006','Fernando','Pintos','fernando.pintos@ucu.edu.uy','1996-05-07',4,'posgrado'),
    ('54000007','Daniel','Rivero','daniel.rivero@ucu.edu.uy','1980-07-31',4,'docente'),
    -- Ciencias Empresariales (facultad 5)
    ('55000001','Martin','Cardozo','martin.cardozo@ucu.edu.uy','2003-10-16',5,'grado'),
    ('55000002','Federico','Olivera','federico.olivera@ucu.edu.uy','2002-03-04',5,'grado'),
    ('55000003','Gabriel','Ferreira','gabriel.ferreira@ucu.edu.uy','2004-08-25',5,'grado'),
    ('55000004','Nahuel','Machado','nahuel.machado@ucu.edu.uy','2003-05-10',5,'grado'),
    ('55000005','Cristian','Techera','cristian.techera@ucu.edu.uy','2002-02-17',5,'grado'),
    ('55000006','Esteban','Barreto','esteban.barreto@ucu.edu.uy','1997-09-28',5,'posgrado'),
    ('55000007','Walter','Davila','walter.davila@ucu.edu.uy','1984-12-14',5,'funcionario'),
    -- Humanidades (facultad 6)
    ('56000001','Ezequiel','Cabral','ezequiel.cabral@ucu.edu.uy','2003-12-08',6,'grado'),
    ('56000002','Valentin','Mora','valentin.mora@ucu.edu.uy','2002-07-06',6,'grado'),
    ('56000003','Thiago','Pizarro','thiago.pizarro@ucu.edu.uy','2004-03-21',6,'grado'),
    ('56000004','Camilo','Brum','camilo.brum@ucu.edu.uy','2003-06-02',6,'grado'),
    ('56000005','Ramiro','Echeverria','ramiro.echeverria@ucu.edu.uy','2002-10-11',6,'grado'),
    ('56000006','Alejandro','Lemos','alejandro.lemos@ucu.edu.uy','1979-08-19',6,'docente'),
    ('56000007','Oscar','Viera','oscar.viera@ucu.edu.uy','1987-02-23',6,'funcionario');

-- ---------------------------------------------------------------------
-- 2. EQUIPOS (sin capitan: se asigna despues de armar el plantel)
-- ---------------------------------------------------------------------
INSERT INTO equipo (id_equipo, nombre, id_torneo, id_facultad) VALUES
    (1, 'Ingenieria FC',    1, 1),
    (2, 'Derecho United',   1, 2),
    (3, 'Medicina FC',      1, 3),
    (4, 'Psicologia FC',    1, 4),
    (5, 'Empresariales FC', 1, 5),
    (6, 'Humanidades FC',   1, 6);

-- ---------------------------------------------------------------------
-- 3. PLANTELES: equipo = 2do digito de la ci, camiseta = ultimo digito
-- ---------------------------------------------------------------------
INSERT INTO equipo_jugador_torneo (ci_jugador, id_torneo, id_equipo, numero_camiseta)
SELECT ci, 1, CAST(SUBSTRING(ci, 2, 1) AS UNSIGNED), CAST(RIGHT(ci, 1) AS UNSIGNED)
FROM jugador
WHERE ci LIKE '5%'
ORDER BY ci;

-- ---------------------------------------------------------------------
-- 4. CAPITANES (camiseta 1 de cada equipo) y torneo en curso
-- ---------------------------------------------------------------------
UPDATE equipo SET ci_capitan = '51000001' WHERE id_equipo = 1;
UPDATE equipo SET ci_capitan = '52000001' WHERE id_equipo = 2;
UPDATE equipo SET ci_capitan = '53000001' WHERE id_equipo = 3;
UPDATE equipo SET ci_capitan = '54000001' WHERE id_equipo = 4;
UPDATE equipo SET ci_capitan = '55000001' WHERE id_equipo = 5;
UPDATE equipo SET ci_capitan = '56000001' WHERE id_equipo = 6;

UPDATE torneo SET estado = 'en curso' WHERE id_torneo = 1;

-- ---------------------------------------------------------------------
-- 5. PARTIDOS (15 cruces en 5 fechas + 1 cancelado y reprogramado)
-- ---------------------------------------------------------------------
INSERT INTO partido (id_partido, id_torneo, numero_fecha, id_equipo_local, id_equipo_visitante,
                     dia, id_turno, nombre_cancha, id_complejo, estado) VALUES
    -- Fecha 1
    (1,  1, 1, 1, 6, '2026-09-21', 1, 'Cancha 1', 1, 'programado'),
    (2,  1, 1, 2, 5, '2026-09-21', 1, 'Cancha 2', 1, 'programado'),
    (3,  1, 1, 3, 4, '2026-09-21', 1, 'Cancha 1', 2, 'programado'),
    -- Fecha 2
    (4,  1, 2, 1, 5, '2026-09-28', 2, 'Cancha 1', 1, 'programado'),
    (5,  1, 2, 6, 4, '2026-09-28', 3, 'Cancha 2', 1, 'programado'),
    (6,  1, 2, 2, 3, '2026-09-28', 2, 'Cancha 2', 2, 'programado'),
    -- Fecha 3 (el partido 9 queda postergado)
    (7,  1, 3, 1, 4, '2026-10-12', 1, 'Cancha 3', 1, 'programado'),
    (8,  1, 3, 5, 3, '2026-10-12', 2, 'Cancha 1', 1, 'programado'),
    (9,  1, 3, 6, 2, '2026-10-12', 3, 'Cancha 1', 2, 'postergado'),
    -- Fecha 4: el primer 1 vs 3 se cancelo y se reprogramo
    (10, 1, 4, 1, 3, '2026-10-19', 1, 'Cancha 1', 1, 'cancelado'),
    (11, 1, 4, 1, 3, '2026-11-09', 1, 'Cancha 1', 1, 'programado'),
    (12, 1, 4, 4, 2, '2026-11-09', 2, 'Cancha 2', 1, 'programado'),
    (13, 1, 4, 5, 6, '2026-11-09', 3, 'Cancha 1', 2, 'programado'),
    -- Fecha 5
    (14, 1, 5, 1, 2, '2026-11-16', 1, 'Cancha 1', 1, 'programado'),
    (15, 1, 5, 3, 6, '2026-11-16', 2, 'Cancha 2', 1, 'programado'),
    (16, 1, 5, 4, 5, '2026-11-16', 3, 'Cancha 2', 2, 'programado');

-- ---------------------------------------------------------------------
-- 6. FECHA 1 (planilla, goles y tarjetas; en orden cronologico)
-- ---------------------------------------------------------------------
INSERT INTO planilla_partido (id_partido, ci_jugador, id_equipo)
SELECT p.id_partido, e.ci_jugador, e.id_equipo
FROM partido p
JOIN equipo_jugador_torneo e ON e.id_equipo IN (p.id_equipo_local, p.id_equipo_visitante)
WHERE p.numero_fecha = 1 AND p.estado <> 'cancelado' AND e.numero_camiseta <= 6
  AND NOT EXISTS (SELECT 1 FROM sancion_jugador s
                  WHERE s.ci_jugador = e.ci_jugador AND s.id_torneo = p.id_torneo
                    AND p.numero_fecha BETWEEN s.numero_fecha_inicio AND s.numero_fecha_fin);

INSERT INTO gol (id_partido, ci_jugador, minuto, autogol) VALUES
    (1, '51000001', 10, FALSE),
    (1, '51000002', 25, FALSE),
    (1, '56000003', 33, FALSE),
    (1, '51000001', 40, FALSE),
    (2, '52000001', 12, FALSE),
    (2, '55000002', 20, FALSE),
    (2, '52000004', 50, FALSE),
    (2, '55000005', 44, FALSE),
    (3, '53000002', 30, TRUE);

INSERT INTO tarjeta (id_partido, ci_jugador, minuto, color) VALUES
    (1, '51000002', 30, 'amarilla'),
    (1, '56000004', 55, 'roja'),
    (2, '55000003', 30, 'amarilla'),
    (2, '52000005', 48, 'amarilla'),
    (3, '54000004', 10, 'amarilla');

-- ---------------------------------------------------------------------
-- 7. FECHA 2
-- ---------------------------------------------------------------------
INSERT INTO planilla_partido (id_partido, ci_jugador, id_equipo)
SELECT p.id_partido, e.ci_jugador, e.id_equipo
FROM partido p
JOIN equipo_jugador_torneo e ON e.id_equipo IN (p.id_equipo_local, p.id_equipo_visitante)
WHERE p.numero_fecha = 2 AND p.estado <> 'cancelado' AND e.numero_camiseta <= 6
  AND NOT EXISTS (SELECT 1 FROM sancion_jugador s
                  WHERE s.ci_jugador = e.ci_jugador AND s.id_torneo = p.id_torneo
                    AND p.numero_fecha BETWEEN s.numero_fecha_inicio AND s.numero_fecha_fin);

INSERT INTO gol (id_partido, ci_jugador, minuto, autogol) VALUES
    (4, '51000003', 15, FALSE),
    (4, '51000001', 55, FALSE),
    (5, '56000002', 18, FALSE),
    (5, '54000001', 40, FALSE),
    (6, '52000001',  5, FALSE),
    (6, '52000002', 22, FALSE),
    (6, '53000001', 30, FALSE),
    (6, '52000001', 37, FALSE),
    (6, '52000003', 58, FALSE);

INSERT INTO tarjeta (id_partido, ci_jugador, minuto, color) VALUES
    (4, '51000002', 20, 'amarilla'),
    (4, '51000002', 60, 'amarilla'),
    (5, '54000004', 44, 'roja'),
    (6, '53000002', 33, 'amarilla');

-- ---------------------------------------------------------------------
-- 8. FECHA 3 (el partido 9 esta postergado: sin planilla)
-- ---------------------------------------------------------------------
INSERT INTO planilla_partido (id_partido, ci_jugador, id_equipo)
SELECT p.id_partido, e.ci_jugador, e.id_equipo
FROM partido p
JOIN equipo_jugador_torneo e ON e.id_equipo IN (p.id_equipo_local, p.id_equipo_visitante)
WHERE p.numero_fecha = 3 AND p.estado NOT IN ('cancelado','postergado') AND e.numero_camiseta <= 6
  AND NOT EXISTS (SELECT 1 FROM sancion_jugador s
                  WHERE s.ci_jugador = e.ci_jugador AND s.id_torneo = p.id_torneo
                    AND p.numero_fecha BETWEEN s.numero_fecha_inicio AND s.numero_fecha_fin);

INSERT INTO gol (id_partido, ci_jugador, minuto, autogol) VALUES
    (7, '51000004', 20, FALSE),
    (7, '54000003', 35, FALSE),
    (7, '54000001', 52, FALSE),
    (8, '55000001',  8, FALSE),
    (8, '53000003', 15, FALSE),
    (8, '55000001', 21, FALSE),
    (8, '53000004', 33, FALSE),
    (8, '55000004', 47, FALSE),
    (8, '53000001', 59, FALSE);

INSERT INTO tarjeta (id_partido, ci_jugador, minuto, color) VALUES
    (7, '51000005', 41, 'amarilla'),
    (8, '53000001', 40, 'amarilla'),
    (8, '55000005', 50, 'amarilla');

-- ---------------------------------------------------------------------
-- 9. MARCAR COMO JUGADOS los partidos 1 a 8
-- ---------------------------------------------------------------------
UPDATE partido SET estado = 'jugado' WHERE id_partido BETWEEN 1 AND 8;

-- ---------------------------------------------------------------------
-- 10. SANCION DISCIPLINARIA (manual, de varias fechas)
-- ---------------------------------------------------------------------
INSERT INTO sancion_jugador (ci_jugador, id_torneo, motivo, numero_fecha_inicio, cantidad_fechas)
VALUES ('53000004', 1, 'disciplinaria', 4, 2);