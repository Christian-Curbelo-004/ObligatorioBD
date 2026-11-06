CREATE VIEW vw_resultado_partido AS
SELECT p.id_partido,
       p.id_torneo,
       p.numero_fecha,
       p.id_equipo_local,
       p.id_equipo_visitante,
       p.dia,
       COUNT(CASE WHEN (g.autogol = 0 AND pl.id_equipo = p.id_equipo_local) OR (g.autogol = 1 AND pl.id_equipo = p.id_equipo_visitante)
                  THEN 1 END) AS goles_local,       -- gol local o autogol de un visitante
       COUNT(CASE WHEN (g.autogol = 0 AND pl.id_equipo = p.id_equipo_visitante) OR (g.autogol = 1 AND pl.id_equipo = p.id_equipo_local)
                  THEN 1 END) AS goles_visitante    -- gol visitante o autogol de un local
FROM partido p
LEFT JOIN gol g ON g.id_partido = p.id_partido      -- LEFT: un 0-0 igual aparece
LEFT JOIN planilla_partido pl
       ON pl.id_partido = g.id_partido AND pl.ci_jugador = g.ci_jugador              -- equipo de quien convirtio
WHERE p.estado = 'jugado'
GROUP BY p.id_partido, p.id_torneo, p.numero_fecha, p.id_equipo_local, p.id_equipo_visitante, p.dia;

CREATE VIEW vw_equipo_resultado AS
SELECT id_torneo, id_partido, numero_fecha,
       id_equipo_local AS id_equipo,
       goles_local AS gf, goles_visitante AS gc
FROM vw_resultado_partido
UNION ALL
SELECT id_torneo, id_partido, numero_fecha,
       id_equipo_visitante AS id_equipo,
       goles_visitante AS gf, goles_local AS gc
FROM vw_resultado_partido;

-- 3. Tabla de posiciones (puntos, luego diferencia de goles, luego goles a favor)
CREATE VIEW vw_tabla_posiciones AS
SELECT RANK() OVER (PARTITION BY t.id_torneo
                    ORDER BY t.puntos DESC, t.dg DESC, t.gf DESC) AS posicion,
       t.*
FROM (SELECT e.id_torneo,
             e.id_equipo,
             e.nombre AS equipo,
             COUNT(r.id_partido) AS pj,
             COUNT(CASE WHEN r.gf >  r.gc THEN 1 END) AS pg,
             COUNT(CASE WHEN r.gf =  r.gc THEN 1 END) AS pe,
             COUNT(CASE WHEN r.gf <  r.gc THEN 1 END) AS pp,
             COALESCE(SUM(r.gf), 0) AS gf,
             COALESCE(SUM(r.gc), 0) AS gc,
             COALESCE(SUM(r.gf), 0) - COALESCE(SUM(r.gc), 0) AS dg,
             3 * COUNT(CASE WHEN r.gf > r.gc THEN 1 END)
               + COUNT(CASE WHEN r.gf = r.gc THEN 1 END) AS puntos
      FROM equipo e
      LEFT JOIN vw_equipo_resultado r ON r.id_equipo = e.id_equipo
      GROUP BY e.id_torneo, e.id_equipo, e.nombre) AS t;