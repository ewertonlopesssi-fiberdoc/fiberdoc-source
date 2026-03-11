-- migrate-v11b.sql
-- Inserir via de entrada (viaNumber=0, label='ENT') nos splitters CTO existentes
-- que foram criados antes da implementação automática da via ENT.
-- Seguro para executar múltiplas vezes (INSERT IGNORE).

INSERT IGNORE INTO `cto_vias` (`tubeId`, `ctoId`, `viaNumber`, `label`, `fusedToViaId`, `fusedToTubeId`, `notes`, `fiberId`)
SELECT 
  ct.id        AS tubeId,
  ct.ctoId     AS ctoId,
  0            AS viaNumber,
  'ENT'        AS label,
  NULL         AS fusedToViaId,
  NULL         AS fusedToTubeId,
  NULL         AS notes,
  NULL         AS fiberId
FROM `cto_tubes` ct
WHERE ct.cto_tube_type = 'splitter'
  AND NOT EXISTS (
    SELECT 1 FROM `cto_vias` cv
    WHERE cv.tubeId = ct.id AND cv.viaNumber = 0
  );
