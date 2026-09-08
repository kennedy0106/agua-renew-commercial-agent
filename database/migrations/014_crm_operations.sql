-- Fase 2: datos maestros, deduplicación segura y operación comercial.
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS secondary_phone_e164 text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES crm_contacts(id) ON DELETE RESTRICT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS merged_at timestamptz;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS merged_by uuid REFERENCES crm_users(id) ON DELETE SET NULL;

ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS address text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_tax_id_unique
  ON crm_companies (organization_id, tax_id)
  WHERE tax_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_company_idx
  ON crm_contacts (company_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_owner_idx
  ON crm_contacts (owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;
WITH duplicate_automation_tasks AS (
  SELECT id, row_number() OVER (PARTITION BY opportunity_id, automation_key ORDER BY created_at, id) AS duplicate_order
  FROM crm_tasks
  WHERE automation_key IS NOT NULL AND status = 'OPEN' AND deleted_at IS NULL
)
UPDATE crm_tasks SET deleted_at = now(), updated_at = now(), version = version + 1
WHERE id IN (SELECT id FROM duplicate_automation_tasks WHERE duplicate_order > 1);

CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_open_automation_unique
  ON crm_tasks (opportunity_id, automation_key)
  WHERE automation_key IS NOT NULL AND status = 'OPEN' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('PHONE','EMAIL')),
  value text NOT NULL,
  normalized_value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, method_type, normalized_value)
);
CREATE INDEX IF NOT EXISTS crm_contact_methods_lookup_idx
  ON crm_contact_methods (organization_id, method_type, normalized_value);

INSERT INTO crm_contact_methods (organization_id, contact_id, method_type, value, normalized_value, is_primary)
SELECT organization_id, id, 'PHONE', phone_e164, phone_e164, TRUE
FROM crm_contacts WHERE phone_e164 IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO crm_contact_methods (organization_id, contact_id, method_type, value, normalized_value, is_primary)
SELECT organization_id, id, 'EMAIL', email, lower(email), TRUE
FROM crm_contacts WHERE email IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_contact_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  target_contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE RESTRICT,
  source_contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  target_version integer NOT NULL,
  source_version integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  moved_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_contact_id)
);
