CREATE TABLE IF NOT EXISTS permanent_provider_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES permanent_providers(id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES permanent_provider_vehicles(id) ON DELETE RESTRICT,
  nfc_tag_id UUID REFERENCES nfc_tags(id) ON DELETE RESTRICT,
  movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('INGRESO', 'SALIDA')),
  source VARCHAR(16) NOT NULL CHECK (source IN ('NFC_FISICO', 'PLACA_MANUAL')),
  confirmed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((source = 'NFC_FISICO' AND nfc_tag_id IS NOT NULL) OR (source = 'PLACA_MANUAL' AND vehicle_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS permanent_provider_movements_provider_idx ON permanent_provider_movements (provider_id, occurred_at DESC);
