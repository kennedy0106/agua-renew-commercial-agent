ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS lead_analysis_jobs (
  lead_id uuid PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  requested_version bigint NOT NULL DEFAULT 1,
  completed_version bigint NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','FAILED','EXHAUSTED')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
  last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_analysis_jobs_due_idx ON lead_analysis_jobs(next_attempt_at) WHERE status IN ('PENDING','FAILED');

CREATE TABLE IF NOT EXISTS crm_data_conflicts (
  id bigserial PRIMARY KEY, organization_id uuid NOT NULL, entity_type varchar(30) NOT NULL,
  entity_id uuid NOT NULL, field_name varchar(40) NOT NULL, canonical_value text, observed_value text,
  status varchar(20) NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, field_name, observed_value, status)
);
