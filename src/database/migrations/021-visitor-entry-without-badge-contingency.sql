ALTER TABLE visitor_visits ALTER COLUMN badge_code DROP NOT NULL;
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS badge_contingency BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS contingency_observation VARCHAR(500);
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS administrative_review_status VARCHAR(12);
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS administrative_review_note VARCHAR(500);
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS administrative_reviewed_by_user_id UUID REFERENCES users(id);
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS administrative_reviewed_at TIMESTAMPTZ;
ALTER TABLE visitor_visits DROP CONSTRAINT IF EXISTS visitor_visits_review_status_check;
ALTER TABLE visitor_visits ADD CONSTRAINT visitor_visits_review_status_check CHECK (administrative_review_status IS NULL OR administrative_review_status IN ('PENDIENTE','RESUELTO'));
