CREATE TABLE IF NOT EXISTS institutional_asset_review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES institutional_vehicle_trips(id) ON DELETE CASCADE,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('APROBADO', 'MANTENER_PENDIENTE')),
  justification VARCHAR(500) NOT NULL,
  decided_by_user_id UUID NOT NULL REFERENCES users(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS institutional_asset_review_actions_trip_idx
  ON institutional_asset_review_actions (trip_id, decided_at DESC);
