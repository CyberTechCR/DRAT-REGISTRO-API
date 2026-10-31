CREATE TABLE IF NOT EXISTS visitor_vehicle_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate VARCHAR(20) NOT NULL,
  entry_confirmed_by_user_id UUID NOT NULL REFERENCES users(id),
  exit_confirmed_by_user_id UUID REFERENCES users(id),
  entry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS visitor_vehicle_visits_open_plate_idx
  ON visitor_vehicle_visits (plate) WHERE exit_at IS NULL;

CREATE TABLE IF NOT EXISTS visitor_vehicle_visit_occupants (
  vehicle_visit_id UUID NOT NULL REFERENCES visitor_vehicle_visits(id) ON DELETE RESTRICT,
  visitor_visit_id UUID NOT NULL REFERENCES visitor_visits(id) ON DELETE RESTRICT,
  role VARCHAR(12) NOT NULL CHECK (role IN ('CONDUCTOR', 'OCUPANTE')),
  PRIMARY KEY (vehicle_visit_id, visitor_visit_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS visitor_vehicle_visit_driver_idx
  ON visitor_vehicle_visit_occupants (vehicle_visit_id) WHERE role = 'CONDUCTOR';
