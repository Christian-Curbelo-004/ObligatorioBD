CREATE TABLE login(
    correo VARCHAR(100) NOT NULL PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('administrador', 'planillero') NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_login_correo CHECK (correo LIKE '%_@_%._%') /* chequear */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO login (correo, password_hash, rol) VALUES       -- usuarios de prueba
    ('admin@ucu.edu.uy',      'HASH_ADMIN_DE_PRUEBA',      'administrador'),  -- el rol coincide con el ENUM
    ('planillero@ucu.edu.uy', 'HASH_PLANILLERO_DE_PRUEBA', 'planillero');     -- se reemplaza por un hash real mas adelante


CREATE TABLE facultad(
    id_facultad INT NOT NULL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO facultad(id_facultad, nombre) VALUES
(1, 'Ingenieria'), (2, 'Derecho'), (3, 'Medicina'),
(4, 'Psicologia'), (5, 'Ciencias Empresariales'), (6, 'Humanidades');

CREATE TABLE jugador(
    ci VARCHAR(8) NOT NULL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    id_facultad INT NOT NULL,
    tipo  ENUM('grado','posgrado','docente','funcionario') NOT NULL,

    CONSTRAINT uq_jugador_email UNIQUE (email), /* email unico */
    CONSTRAINT ck_jugador_ci CHECK (ci REGEXP '^[0-9]{7,8}$'), /* la cedula solo puede tener 7 u 8 numeros */
    CONSTRAINT ck_jugador_email CHECK (email LIKE '%_@_%._%'),  /* formato del mail */
    CONSTRAINT fk_jugador_facultad FOREIGN KEY (id_facultad) REFERENCES facultad (id_facultad)   /* la columna id_facultad */
)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



CREATE TABLE torneo (
    id_torneo    INT AUTO_INCREMENT PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL,
    anio         SMALLINT NOT NULL,
    semestre     TINYINT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE NOT NULL,
    estado       ENUM('inscripcion','en curso','finalizado')
                 NOT NULL DEFAULT 'inscripcion',
    CONSTRAINT uq_torneo_anio_sem UNIQUE (anio, semestre),
    CONSTRAINT ck_torneo_anio     CHECK (anio BETWEEN 2000 AND 2100),
    CONSTRAINT ck_torneo_semestre CHECK (semestre IN (1, 2)),
    CONSTRAINT ck_torneo_fechas   CHECK (fecha_fin >= fecha_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO torneo (nombre, anio, semestre, fecha_inicio, fecha_fin, estado) VALUES
    ('Torneo Interfacultades de Fútbol 5 - Segundo Semestre 2026',
     2026, 2, '2026-09-14', '2026-12-04', 'inscripcion');

-- ============ EQUIPO ============
CREATE TABLE equipo (                                       -- crea la tabla equipo
    id_equipo   INT AUTO_INCREMENT PRIMARY KEY,             -- PK: id que asigna la base sola
    nombre      VARCHAR(80) NOT NULL,                       -- nombre del equipo
    id_torneo   INT NOT NULL,                               -- edicion en la que compite (FK)
    id_facultad INT NOT NULL,                               -- facultad que representa (FK)
    ci_capitan  VARCHAR(8) NULL,                            -- capitan (FK); acepta NULL porque se asigna despues de armar el plantel
    CONSTRAINT uq_equipo_nombre UNIQUE (id_torneo, nombre), -- no se repite el nombre dentro de un torneo
    CONSTRAINT uq_equipo_con_torneo UNIQUE (id_equipo, id_torneo), -- permite que otras tablas referencien el par (equipo, torneo)
    CONSTRAINT fk_equipo_torneo
        FOREIGN KEY (id_torneo)                             -- id_torneo...
        REFERENCES torneo (id_torneo),                      -- ...debe existir en torneo
    CONSTRAINT fk_equipo_facultad
        FOREIGN KEY (id_facultad)                           -- id_facultad...
        REFERENCES facultad (id_facultad),                  -- ...debe existir en facultad
    CONSTRAINT fk_equipo_capitan
        FOREIGN KEY (ci_capitan)                            -- ci_capitan...
        REFERENCES jugador (ci)                             -- ...debe existir en jugador (NULL permitido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset

CREATE TABLE equipo_jugador_torneo (
    ci_jugador      VARCHAR(8) NOT NULL,                    -- jugador inscripto
    id_torneo       INT NOT NULL,                           -- edicion
    id_equipo       INT NOT NULL,                           -- equipo (ya NO es PK)
    numero_camiseta TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (ci_jugador, id_torneo),                    -- una sola vez la palabra KEY
    CONSTRAINT uq_ejt_camiseta UNIQUE (id_equipo, numero_camiseta),
    CONSTRAINT ck_ejt_camiseta CHECK (numero_camiseta BETWEEN 1 AND 99),
    CONSTRAINT fk_ejt_jugador
        FOREIGN KEY (ci_jugador)
        REFERENCES jugador (ci),
    CONSTRAINT fk_ejt_equipo
        FOREIGN KEY (id_equipo, id_torneo)
        REFERENCES equipo (id_equipo, id_torneo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;




CREATE TABLE complejo (
    id_complejo INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(100) NOT NULL,
    departamento VARCHAR(100) NOT NULL,
    CONSTRAINT uq_complejo_nombre UNIQUE (nombre)           -- no puede haber dos complejos con el mismo nombre
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset para tildes

INSERT INTO complejo (nombre, direccion, departamento) VALUES   -- complejos de prueba (sin id: lo genera AUTO_INCREMENT)
    ('Complejo Deportivo Central', 'Av. Italia 1234',  'Montevideo'),  -- queda con id 1
    ('Complejo Punta Carretas',    'Bulevar Artigas 1500', 'Montevideo'); -- queda con id 2

CREATE TABLE cancha (
    nombre_cancha VARCHAR(100) NOT NULL,
    id_complejo INT NOT NULL,
    superficie ENUM('sintetico','parquet') NOT NULL,
    techada BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (nombre_cancha, id_complejo),               -- PK compuesta: el nombre solo no alcanza, se identifica con el par
    CONSTRAINT fk_cancha_complejo                           -- nombre de la restriccion (sale en los errores)
        FOREIGN KEY (id_complejo)                           -- la columna id_complejo...
        REFERENCES complejo (id_complejo)                   -- ...debe existir en la tabla complejo
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset para tildes

INSERT INTO cancha (nombre_cancha, id_complejo, superficie, techada) VALUES   -- canchas de prueba
    ('Cancha 1', 1, 'sintetico', FALSE),                    -- complejo 1: sintetica descubierta
    ('Cancha 2', 1, 'sintetico', TRUE),                     -- complejo 1: sintetica techada
    ('Cancha 3', 1, 'parquet',   TRUE),                     -- complejo 1: parquet techada
    ('Cancha 1', 2, 'sintetico', FALSE),                    -- complejo 2: mismo nombre que otra, distinto complejo (por eso la PK compuesta)
    ('Cancha 2', 2, 'parquet',   TRUE);                     -- complejo 2: parquet techada

CREATE TABLE turno (
    id_turno    INT AUTO_INCREMENT PRIMARY KEY,
    hora_inicio TIME NOT NULL,
    hora_fin    TIME NOT NULL,
    CONSTRAINT uq_turno_inicio UNIQUE (hora_inicio),
    CONSTRAINT ck_turno_rango CHECK (hora_inicio >= '18:00:00' AND hora_fin <= '23:00:00'),
    CONSTRAINT ck_turno_una_hora CHECK (TIMEDIFF(hora_fin, hora_inicio) = '01:00:00')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO turno (hora_inicio, hora_fin) VALUES
    ('18:00:00', '19:00:00'),
    ('19:00:00', '20:00:00'),
    ('20:00:00', '21:00:00'),
    ('21:00:00', '22:00:00'),
    ('22:00:00', '23:00:00');


CREATE TABLE partido (
    id_partido INT AUTO_INCREMENT PRIMARY KEY,
    id_torneo  INT NOT NULL,
    numero_fecha TINYINT UNSIGNED NOT NULL,
    id_equipo_local INT NOT NULL,
    id_equipo_visitante INT NOT NULL,
    dia DATE NOT NULL,
    id_turno INT NOT NULL,
    nombre_cancha VARCHAR(30) NOT NULL,
    id_complejo INT NOT NULL,
    estado ENUM('programado','jugado','postergado','cancelado') NOT NULL DEFAULT 'programado',      -- los 4 estados de la letra
    -- Columnas generadas: valen NULL si el partido esta cancelado.
    -- MySQL ignora las filas con algun NULL en un indice UNIQUE.
    dia_activo   DATE GENERATED ALWAYS AS
                 (IF(estado = 'cancelado', NULL, dia)) STORED,            -- = dia, o NULL si esta cancelado
    equipo_menor INT GENERATED ALWAYS AS
                 (IF(estado = 'cancelado', NULL,
                     LEAST(id_equipo_local, id_equipo_visitante))) STORED, -- id menor del cruce (A-B y B-A quedan iguales)
    equipo_mayor INT GENERATED ALWAYS AS
                 (IF(estado = 'cancelado', NULL,
                     GREATEST(id_equipo_local, id_equipo_visitante))) STORED, -- id mayor del cruce

    CONSTRAINT ck_partido_fecha   CHECK (numero_fecha >= 1),                  -- la fecha empieza en 1
    CONSTRAINT ck_partido_distint CHECK (id_equipo_local <> id_equipo_visitante), -- un equipo no juega contra si mismo

    CONSTRAINT uq_partido_cancha_turno                      -- una cancha, un partido por dia y turno
        UNIQUE (dia_activo, id_turno, nombre_cancha, id_complejo),            -- los cancelados valen NULL y no cuentan
    CONSTRAINT uq_partido_cruce                             -- un cruce se juega una sola vez por edicion
        UNIQUE (id_torneo, equipo_menor, equipo_mayor),                       -- los cancelados valen NULL y no cuentan

    CONSTRAINT fk_partido_torneo FOREIGN KEY (id_torneo)                      -- el torneo debe existir
        REFERENCES torneo (id_torneo),
    CONSTRAINT fk_partido_local FOREIGN KEY (id_equipo_local, id_torneo)      -- el local debe ser de ese torneo
        REFERENCES equipo (id_equipo, id_torneo),
    CONSTRAINT fk_partido_visitante FOREIGN KEY (id_equipo_visitante, id_torneo) -- el visitante tambien
        REFERENCES equipo (id_equipo, id_torneo),
    CONSTRAINT fk_partido_turno FOREIGN KEY (id_turno)                        -- el turno debe existir
        REFERENCES turno (id_turno),
    CONSTRAINT fk_partido_cancha FOREIGN KEY (nombre_cancha, id_complejo)     -- la cancha debe existir en ese complejo
        REFERENCES cancha (nombre_cancha, id_complejo),

    INDEX idx_partido_torneo_fecha (id_torneo, numero_fecha)                  -- acelera la regla de un partido por fecha
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset

CREATE TABLE planilla_partido (                             -- crea la tabla de la planilla de juego
    id_partido INT NOT NULL,                                -- partido (FK); mismo tipo que partido.id_partido
    ci_jugador VARCHAR(8) NOT NULL,                         -- jugador que participo (FK); mismo tipo que jugador.ci
    id_equipo  INT NOT NULL,                                -- equipo por el que jugo en este partido (FK)
    PRIMARY KEY (id_partido, ci_jugador),                   -- un jugador figura una sola vez por partido
    CONSTRAINT fk_planilla_partido                          -- nombre de la restriccion (sale en los errores)
        FOREIGN KEY (id_partido)                            -- la columna id_partido...
        REFERENCES partido (id_partido),                    -- ...debe existir en partido
    CONSTRAINT fk_planilla_jugador
        FOREIGN KEY (ci_jugador)                            -- la columna ci_jugador...
        REFERENCES jugador (ci),                            -- ...debe existir en jugador
    CONSTRAINT fk_planilla_equipo
        FOREIGN KEY (id_equipo)                             -- la columna id_equipo...
        REFERENCES equipo (id_equipo),                      -- ...debe existir en equipo
    INDEX idx_planilla_equipo (id_partido, id_equipo)       -- acelera el calculo del resultado por equipo
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset




CREATE TABLE gol(
    id_gol     INT AUTO_INCREMENT PRIMARY KEY,              -- PK: id que asigna la base sola
    id_partido INT NOT NULL,                                -- partido en el que se convirtio (parte 1 de la FK compuesta)
    ci_jugador VARCHAR(8) NOT NULL,                         -- jugador que lo convirtio (parte 2 de la FK compuesta)
    minuto     TINYINT UNSIGNED NOT NULL,                   -- minuto del gol (sin negativos)
    autogol    BOOLEAN NOT NULL DEFAULT FALSE,              -- true si fue en contra; por defecto es gol normal
    CONSTRAINT ck_gol_minuto CHECK (minuto BETWEEN 1 AND 60),   -- el turno dura una hora, asi que el minuto va de 1 a 60
    CONSTRAINT fk_gol_planilla                              -- nombre de la restriccion (sale en los errores)
        FOREIGN KEY (id_partido, ci_jugador)                -- el par (partido, jugador)...
        REFERENCES planilla_partido (id_partido, ci_jugador) -- ...debe figurar en la planilla de ese partido
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset







CREATE TABLE tarjeta (                                      -- crea la tabla de tarjetas
    id_tarjeta INT AUTO_INCREMENT PRIMARY KEY,              -- PK: id que asigna la base sola
    id_partido INT NOT NULL,                                -- partido en el que se mostro (parte 1 de la FK compuesta)
    ci_jugador VARCHAR(8) NOT NULL,                         -- jugador amonestado (parte 2 de la FK compuesta)
    minuto     TINYINT UNSIGNED NOT NULL,                   -- minuto de la tarjeta (sin negativos)
    color      ENUM('amarilla','roja') NOT NULL,            -- solo estos dos colores de la letra
    CONSTRAINT ck_tarjeta_minuto CHECK (minuto BETWEEN 1 AND 60),   -- el turno dura una hora, asi que el minuto va de 1 a 60
    CONSTRAINT fk_tarjeta_planilla                          -- nombre de la restriccion (sale en los errores)
        FOREIGN KEY (id_partido, ci_jugador)                -- el par (partido, jugador)...
        REFERENCES planilla_partido (id_partido, ci_jugador) -- ...debe figurar en la planilla de ese partido
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset



CREATE TABLE sancion_jugador (                              -- crea la tabla de sanciones
    id_sancion          INT AUTO_INCREMENT PRIMARY KEY,     -- PK: id que asigna la base sola
    ci_jugador          VARCHAR(8) NOT NULL,                -- jugador sancionado (parte 1 de la FK compuesta)
    id_torneo           INT NOT NULL,                       -- edicion en la que rige la sancion (parte 2 de la FK compuesta)
    motivo              ENUM('roja','acumulacion de amarillas','disciplinaria') NOT NULL, -- los 3 motivos de la letra (sin tilde)
    numero_fecha_inicio TINYINT UNSIGNED NOT NULL,          -- primera fecha del torneo que cumple suspendido
    cantidad_fechas     TINYINT UNSIGNED NOT NULL,          -- cuantas fechas dura la suspension
    id_tarjeta_origen   INT NULL,                           -- ADICIONAL: tarjeta que la origino (NULL si es disciplinaria)
    numero_fecha_fin    TINYINT UNSIGNED GENERATED ALWAYS AS
                        (numero_fecha_inicio + cantidad_fechas - 1) STORED,  -- ADICIONAL: ultima fecha abarcada, se calcula sola
    CONSTRAINT ck_sancion_inicio   CHECK (numero_fecha_inicio >= 1),  -- las fechas empiezan en 1
    CONSTRAINT ck_sancion_cantidad CHECK (cantidad_fechas >= 1),      -- minimo una fecha de suspension
    CONSTRAINT ck_sancion_origen CHECK (                    -- las automaticas nacen de una tarjeta; las disciplinarias no
        (motivo = 'disciplinaria' AND id_tarjeta_origen IS NULL)
        OR (motivo <> 'disciplinaria' AND id_tarjeta_origen IS NOT NULL)),
    CONSTRAINT uq_sancion_tarjeta UNIQUE (id_tarjeta_origen),         -- una tarjeta genera como maximo una sancion (los NULL no cuentan)
    CONSTRAINT fk_sancion_plantel                           -- nombre de la restriccion (sale en los errores)
        FOREIGN KEY (ci_jugador, id_torneo)                 -- el par (jugador, torneo)...
        REFERENCES equipo_jugador_torneo (ci_jugador, id_torneo), -- ...debe estar inscripto en un plantel de esa edicion
    CONSTRAINT fk_sancion_tarjeta
        FOREIGN KEY (id_tarjeta_origen)                     -- la tarjeta de origen...
        REFERENCES tarjeta (id_tarjeta),                    -- ...debe existir (NULL permitido)
    INDEX idx_sancion_jugador (ci_jugador, id_torneo, numero_fecha_inicio, numero_fecha_fin) -- acelera "esta suspendido?"
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;                    -- motor con FK y charset

