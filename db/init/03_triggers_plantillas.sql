DELIMITER $$

CREATE TRIGGER trg_platinlla_bi
    BEFORE INSERT ON planilla_partido FOR EACH ROW BEGIN
    DECLARE v_local     INT;
    DECLARE v_visitante INT;
    DECLARE v_torneo    INT;
    DECLARE v_fecha     INT;

    SELECT id_equipo_local, id_equipo_visitante, id_torneo, numero_fecha INTO v_local, v_visitante, v_torneo, v_fecha
    FROM partido WHERE id_partido = NEW.id_partido;

    IF NEW.id_equipo NOT IN (v_local, v_visitante) THEN SIGNAL SQLSTATE  '45000' SET MESSAGE_TEXT = 'El equipo indicado no juega este partido';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM equipo_jugador_torneo WHERE ci_jugador = NEW.ci_jugador AND id_equipo = NEW.id_equipo AND id_torneo = v_torneo )
       THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El jugador no pertenece al plantel de ese equipo'; -- mensaje
    END IF;

    IF EXISTS (SELECT 1 FROM sancion_jugador s WHERE s.ci_jugador = NEW.ci_jugador AND s.id_torneo = v_torneo AND v_fecha BETWEEN s.numero_fecha_inicio
    AND s.numero_fecha_fin) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El jugador esta suspendido en esta fecha del torneo';
    END IF;
END$$

CREATE TRIGGER trg_planilla_bu BEFORE UPDATE ON planilla_partido FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'La planilla no se actualiza: elimine al jugador y registrarlo de nuevo';
END$$

CREATE TRIGGER trg_tarjeta_bu BEFORE UPDATE ON tarjeta
    FOR EACH ROW BEGIN SIGNAL SQLSTATE  '45000' SET MESSAGE_TEXT = 'La tarjeta no se actualiza: eliminela y registrela de nuevo';
END$$

CREATE TRIGGER trg_tarjeta_bd_sancion BEFORE DELETE ON tarjeta FOR EACH ROW BEGIN DELETE FROM sancion_jugador WHERE id_tarjeta_origen = OLD.id_tarjeta;          -- ...la que origino esta tarjeta (si hay), asi la FK no bloquea el borrado
END$$

CREATE TRIGGER trg_tarjeta_ai AFTER INSERT ON tarjeta FOR EACH ROW BEGIN DECLARE v_torneo    INT;                           -- variable: torneo del partido
    DECLARE v_fecha     INT;                           -- variable: jornada del partido
    DECLARE v_amarillas INT;                           -- variable: amarillas acumuladas del jugador en el torneo

    SELECT id_torneo, numero_fecha                     -- trae el torneo y la jornada...
    INTO v_torneo, v_fecha                             -- ...y los guarda en las variables
    FROM partido WHERE id_partido = NEW.id_partido;    -- del partido de la tarjeta

    IF NEW.color = 'roja' THEN                         -- si la tarjeta es roja...
        INSERT INTO sancion_jugador                    -- ...crea una sancion
            (ci_jugador, id_torneo, motivo,            -- jugador, torneo y motivo
             numero_fecha_inicio, cantidad_fechas,     -- desde que fecha y cuantas fechas
             id_tarjeta_origen)                        -- y la tarjeta que la origino
        VALUES (NEW.ci_jugador, v_torneo, 'roja',      -- jugador, torneo y motivo roja
                v_fecha + 1, 1, NEW.id_tarjeta);       -- 1 fecha, la siguiente a la del partido
    ELSE                                               -- si es amarilla...
        SELECT COUNT(*) INTO v_amarillas               -- cuenta las amarillas...
        FROM tarjeta t                                 -- ...de la tabla de tarjetas...
        JOIN partido p ON p.id_partido = t.id_partido  -- ...unida a partido para conocer el torneo...
        WHERE t.ci_jugador = NEW.ci_jugador            -- ...de este jugador...
          AND p.id_torneo  = v_torneo                  -- ...en este torneo...
          AND t.color      = 'amarilla';               -- ...que sean amarillas (la nueva ya esta contada)

        IF v_amarillas % 3 = 0 THEN                    -- si el total es multiplo de 3 (3, 6, 9...)
            INSERT INTO sancion_jugador                -- ...crea una sancion
                (ci_jugador, id_torneo, motivo,        -- jugador, torneo y motivo
                 numero_fecha_inicio, cantidad_fechas, -- desde que fecha y cuantas fechas
                 id_tarjeta_origen)                    -- y la tarjeta que la origino
            VALUES (NEW.ci_jugador, v_torneo, 'acumulacion de amarillas', -- motivo acumulacion
                    v_fecha + 1, 1, NEW.id_tarjeta);   -- 1 fecha, la siguiente a la del partido
        END IF;                                        -- cierra el IF del multiplo
    END IF;                                            -- cierra el IF del color
END$$                                                  -- termina el trigger

DELIMITER ;