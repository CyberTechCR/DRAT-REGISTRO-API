ALTER TABLE institutional_vehicle_trip_assets
  ADD COLUMN IF NOT EXISTS returned_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS return_observation VARCHAR(500),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE institutional_vehicle_trip_assets DROP CONSTRAINT IF EXISTS institutional_vehicle_trip_assets_returned_quantity_check;
ALTER TABLE institutional_vehicle_trip_assets ADD CONSTRAINT institutional_vehicle_trip_assets_returned_quantity_check
  CHECK (returned_quantity IS NULL OR (returned_quantity >= 0 AND returned_quantity <= quantity));

ALTER TABLE institutional_vehicle_trips
  ADD COLUMN IF NOT EXISTS asset_review_status VARCHAR(12),
  ADD COLUMN IF NOT EXISTS asset_review_note VARCHAR(500),
  ADD COLUMN IF NOT EXISTS asset_reviewed_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS asset_reviewed_at TIMESTAMPTZ;

ALTER TABLE institutional_vehicle_trips DROP CONSTRAINT IF EXISTS institutional_vehicle_trips_asset_review_status_check;
ALTER TABLE institutional_vehicle_trips ADD CONSTRAINT institutional_vehicle_trips_asset_review_status_check
  CHECK (asset_review_status IS NULL OR asset_review_status IN ('PENDIENTE', 'RESUELTO'));

CREATE INDEX IF NOT EXISTS institutional_vehicle_trips_asset_review_idx
  ON institutional_vehicle_trips (asset_review_status) WHERE asset_review_status = 'PENDIENTE';
