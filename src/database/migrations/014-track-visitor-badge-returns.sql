ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS badge_returned_at TIMESTAMPTZ;
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS badge_return_pending BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE visitor_visits SET badge_returned_at = exit_at WHERE exit_at IS NOT NULL AND badge_returned_at IS NULL AND badge_return_pending = FALSE;
CREATE INDEX IF NOT EXISTS visitor_visits_badge_pending_idx ON visitor_visits (badge_return_pending) WHERE badge_return_pending = TRUE;
UPDATE nfc_tags SET active = TRUE, updated_at = NOW() WHERE employee_id IS NULL;
