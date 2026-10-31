ALTER TABLE nfc_tags ADD COLUMN IF NOT EXISTS condition VARCHAR(12) NOT NULL DEFAULT 'OPERATIVO' CHECK (condition IN ('OPERATIVO','DANADO','PERDIDO','INACTIVO'));
UPDATE nfc_tags SET condition = 'INACTIVO' WHERE active = FALSE AND condition = 'OPERATIVO';
CREATE TABLE IF NOT EXISTS nfc_tag_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfc_tag_id UUID NOT NULL REFERENCES nfc_tags(id) ON DELETE CASCADE,
  event VARCHAR(40) NOT NULL,
  detail VARCHAR(500) NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nfc_tag_history_tag_date_idx ON nfc_tag_history (nfc_tag_id, occurred_at DESC);
