ALTER TABLE employee_movements
  ADD COLUMN IF NOT EXISTS client_operation_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS client_occurred_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS employee_movements_client_operation_uidx
  ON employee_movements (client_operation_id)
  WHERE client_operation_id IS NOT NULL;
