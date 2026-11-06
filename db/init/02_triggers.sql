DELIMITER $$

CREATE TRIGGER trg_equipo_bi_capitan
    BEFORE INSERT ON equipo
    FOR EACH ROW BEGIN
    IF NEW.ci_capitan IS NOT NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El capitan se asigna al momento de crear el plantel';
    end if;
END$$

CREATE TRIGGER _trg_equipo_bu_capitan
    BEFORE UPDATE ON equipo FOR EACH ROW
    BEGIN
        IF NEW.ci_capitan IS NOT NULL AND NOT (NEW.ci_capitan <=> OLD.ci_capitan) THEN IF NOT EXISTS(SELECT 1 FROM equipo_jugador_torneo WHERE
        ci_jugador= NEW.ci_capitan AND id_equipo= NEW.id_equipo ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El capitan debe ser jugador del plantel del equipo'; -- mensaje
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_ejt_bd_capitan
    BEFORE DELETE ON equipo_jugador_torneo FOR EACH ROW
    BEGIN IF EXISTS(SELECT 1 FROM equipo WHERE id_equipo = OLD.id_equipo AND ci_capitan = OLD.ci_jugador) THEN SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'No se puede remover al capitan';
    END IF;
END$$


DELIMITER $$

CREATE TRIGGER trg_ejt_bi
BEFORE INSERT ON equipo_jugador_torneo
FOR EACH ROW
BEGIN
    DECLARE v_estado      VARCHAR(20);
    DECLARE v_fac_equipo  INT;
    DECLARE v_fac_jugador INT;
    DECLARE v_tipo        VARCHAR(20);
    DECLARE v_total       INT;
    DECLARE v_no_alumnos  INT;
    DECLARE v_bloqueo     INT;

    SELECT id_equipo INTO v_bloqueo
    FROM equipo WHERE id_equipo = NEW.id_equipo
    FOR UPDATE;

    SELECT estado INTO v_estado
    FROM torneo WHERE id_torneo = NEW.id_torneo;
    IF v_estado <> 'inscripcion' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El plantel solo puede modificarse en etapa de inscripcion';
    END IF;

    SELECT id_facultad INTO v_fac_equipo
    FROM equipo WHERE id_equipo = NEW.id_equipo;
    SELECT id_facultad, tipo INTO v_fac_jugador, v_tipo
    FROM jugador WHERE ci = NEW.ci_jugador;
    IF v_fac_jugador <> v_fac_equipo THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El jugador debe pertenecer a la facultad del equipo';
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM equipo_jugador_torneo WHERE id_equipo = NEW.id_equipo;
    IF v_total >= 10 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El plantel ya tiene el maximo de 10 jugadores';
    END IF;

    IF v_tipo IN ('docente','funcionario') THEN
        SELECT COUNT(*) INTO v_no_alumnos
        FROM equipo_jugador_torneo e
        JOIN jugador j ON j.ci = e.ci_jugador
        WHERE e.id_equipo = NEW.id_equipo
          AND j.tipo IN ('docente','funcionario');
        IF v_no_alumnos >= 2 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El plantel admite como maximo 2 docentes/funcionarios';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_ejt_bu
BEFORE UPDATE ON equipo_jugador_torneo
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'El plantel no se actualiza: elimine al jugador y vuelva a inscribirlo';
END$$

CREATE TRIGGER trg_ejt_bd_inscripcion
BEFORE DELETE ON equipo_jugador_torneo
FOR EACH ROW
BEGIN
    DECLARE v_estado VARCHAR(20);
    SELECT estado INTO v_estado
    FROM torneo WHERE id_torneo = OLD.id_torneo;
    IF v_estado <> 'inscripcion' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El plantel solo puede modificarse en etapa de inscripcion';
    END IF;
END$$

CREATE TRIGGER trg_partido_bd
BEFORE DELETE ON partido
FOR EACH ROW
BEGIN
    IF OLD.estado = 'jugado' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un partido jugado no puede eliminarse';
    END IF;
END$$

DELIMITER ;