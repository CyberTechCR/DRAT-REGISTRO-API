ALTER TABLE movement_contingencies ADD COLUMN IF NOT EXISTS authorized_by_reference VARCHAR(160);
ALTER TABLE movement_contingencies ADD COLUMN IF NOT EXISTS observations VARCHAR(500);
