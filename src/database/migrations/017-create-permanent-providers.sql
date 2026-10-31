CREATE TABLE IF NOT EXISTS permanent_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), identification VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL, company VARCHAR(160) NOT NULL, phone VARCHAR(40) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS permanent_provider_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider_id UUID NOT NULL REFERENCES permanent_providers(id) ON DELETE CASCADE,
  plate VARCHAR(20) NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS permanent_provider_tags (
  provider_id UUID NOT NULL REFERENCES permanent_providers(id) ON DELETE CASCADE,
  nfc_tag_id UUID NOT NULL UNIQUE REFERENCES nfc_tags(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, nfc_tag_id)
);
CREATE INDEX IF NOT EXISTS permanent_provider_name_idx ON permanent_providers (name);
