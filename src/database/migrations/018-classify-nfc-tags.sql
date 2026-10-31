ALTER TABLE nfc_tags ADD COLUMN IF NOT EXISTS purpose VARCHAR(16) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE nfc_tags DROP CONSTRAINT IF EXISTS nfc_tags_purpose_check;
ALTER TABLE nfc_tags ADD CONSTRAINT nfc_tags_purpose_check CHECK (purpose IN ('GENERAL', 'VISITANTE'));

UPDATE nfc_tags nt
SET purpose = 'VISITANTE'
WHERE EXISTS (SELECT 1 FROM visitor_visits vv WHERE vv.badge_code = nt.code)
   OR EXISTS (SELECT 1 FROM nfc_tag_history h WHERE h.nfc_tag_id = nt.id AND h.detail ILIKE '%visitante%');
