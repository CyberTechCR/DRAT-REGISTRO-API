ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS badge_return_resolution VARCHAR(300);
ALTER TABLE visitor_visits ADD COLUMN IF NOT EXISTS badge_return_resolved_by_user_id UUID REFERENCES users(id);
