CREATE TABLE IF NOT EXISTS manual_movement_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_movement_id UUID NOT NULL UNIQUE REFERENCES employee_movements(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'RESUELTO')),
  reviewed_by_user_id UUID REFERENCES users(id),
  review_note VARCHAR(500),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_movement_reviews_pending_idx
  ON manual_movement_reviews (created_at DESC) WHERE status = 'PENDIENTE';

ALTER TABLE manual_movement_reviews ALTER COLUMN employee_movement_id DROP NOT NULL;
ALTER TABLE manual_movement_reviews ADD COLUMN IF NOT EXISTS private_vehicle_movement_id UUID UNIQUE REFERENCES private_vehicle_movements(id) ON DELETE CASCADE;
ALTER TABLE manual_movement_reviews ADD COLUMN IF NOT EXISTS record_type VARCHAR(30) NOT NULL DEFAULT 'FUNCIONARIO';
ALTER TABLE manual_movement_reviews DROP CONSTRAINT IF EXISTS manual_movement_reviews_record_type_check;
ALTER TABLE manual_movement_reviews ADD CONSTRAINT manual_movement_reviews_record_type_check CHECK (record_type IN ('FUNCIONARIO', 'VEHICULO_PARTICULAR'));
