CREATE TABLE IF NOT EXISTS movement_photo_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type VARCHAR(40) NOT NULL CHECK (movement_type IN ('VEHICULO_PARTICULAR', 'VEHICULO_INSTITUCIONAL', 'VEHICULO_VISITANTE', 'PROVEEDOR_PERMANENTE')),
  movement_id UUID NOT NULL,
  plate VARCHAR(20) NOT NULL,
  storage_path VARCHAR(500) NOT NULL UNIQUE,
  public_url VARCHAR(1000) NOT NULL,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS movement_photo_evidence_movement_idx
  ON movement_photo_evidence(movement_type, movement_id);
