CREATE TABLE IF NOT EXISTS institutional_vehicle_trip_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES institutional_vehicle_trips(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  identifier VARCHAR(100),
  observation VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS institutional_vehicle_trip_assets_trip_idx
  ON institutional_vehicle_trip_assets (trip_id);
