ALTER TABLE manual_movement_reviews DROP CONSTRAINT IF EXISTS manual_movement_reviews_status_check;
ALTER TABLE manual_movement_reviews ADD CONSTRAINT manual_movement_reviews_status_check
  CHECK (status IN ('PENDIENTE', 'RESUELTO', 'APROBADO', 'RECHAZADO'));

ALTER TABLE manual_movement_reviews ADD COLUMN IF NOT EXISTS decision VARCHAR(12);
ALTER TABLE manual_movement_reviews DROP CONSTRAINT IF EXISTS manual_movement_reviews_decision_check;
ALTER TABLE manual_movement_reviews ADD CONSTRAINT manual_movement_reviews_decision_check
  CHECK (decision IS NULL OR decision IN ('APROBADO', 'RECHAZADO'));
