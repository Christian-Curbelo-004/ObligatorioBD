DELIMITER $$

CREATE PROCEDURE sp_validar_ventana(IN p_id_partido INT)
BEGIN
    DECLARE v_estado VARCHAR(30);
    DECLARE v_dia DATE;
    DECLARE v_inicio TIME;
    DECLARE v_fin TIME;

    SELECT p.estado, p.dia, t.hora_inicio, t.hora_fin INTO v_estado, v_dia, v_inicio, v_fin -- trae estado, dia y horas del turno...
    FROM partido p                                     -- de la tabla partido...
    JOIN turno t ON t.id_turno = p.id_turno            -- ...unida a turno para conocer las horas
    WHERE p.id_partido = p_id_partido;

    IF v_estado IN ('cancelado', 'postergado') THEN SIGNAL SQLSTATE  '45000' SET MESSAGE_TEXT = 'No se puede registrar un partido que fue cancelado o postergado';
    END IF;

    IF TIMESTAMP (v_dia, v_inicio) > NOW() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El partido no se ha jugado aun';
    END IF;

    IF NOW() > TIMESTAMP (v_dia, v_fin) + INTERVAL 48 HOUR THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pasaron mas de 48 horas del partido';
    END IF;

END $$;

/* Planilla */
CREATE TRIGGER trg_planilla_ventana_bi BEFORE INSERT ON planilla_partido FOR EACH ROW BEGIN CALL sp_validar_ventana(NEW.id_partido);
END $$;

CREATE TRIGGER trg_planilla_ventana_bd BEFORE DELETE ON planilla_partido FOR EACH ROW BEGIN CALL sp_validar_ventana(OLD.id_partido);
END $$;

/* GOL */

CREATE TRIGGER trg_gol_ventana_bi BEFORE INSERT ON gol FOR EACH ROW BEGIN CALL sp_validar_ventana(NEW.id_partido);
END $$;

CREATE TRIGGER trg_gol_ventana_bd BEFORE DELETE ON gol FOR EACH ROW BEGIN CALL sp_validar_ventana(OLD.id_partido);
END $$;

CREATE TRIGGER trg_gol_ventana_bu BEFORE UPDATE ON gol FOR EACH ROW BEGIN CALL sp_validar_ventana(OLD.id_partido);
IF NOT (NEW.id_partido <=> OLD.id_partido) THEN CALL sp_validar_ventana(NEW.id_partido);
    END IF;
END $$;

-- TARJETA (el UPDATE ya esta bloqueado en 03_triggers_planilla.sql)
CREATE TRIGGER trg_tarjeta_ventana_bi
BEFORE INSERT ON tarjeta
FOR EACH ROW
BEGIN
    CALL sp_validar_ventana(NEW.id_partido);
END$$

CREATE TRIGGER trg_tarjeta_ventana_bd
BEFORE DELETE ON tarjeta
FOR EACH ROW
BEGIN
    CALL sp_validar_ventana(OLD.id_partido);
END $$;

DELIMITER ;

SHOW TRIGGERS;   -- deben salir 23: 11 del 02, 5 del 03 y 7 de este archivo

-- Partido 1 es de septiembre: debe FALLAR por la ventana de 48 h
INSERT INTO gol (id_partido, ci_jugador, minuto, autogol) VALUES (1, '51000001', 5, FALSE);

-- Partido 9 esta postergado: debe FALLAR
INSERT INTO planilla_partido (id_partido, ci_jugador, id_equipo) VALUES (9, '56000001', 6);