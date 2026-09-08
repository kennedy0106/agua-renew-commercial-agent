-- CRM Agua ReNew: identidad, contactos, oportunidades, actividades, cotizaciones y auditoría.
-- Migración aditiva. El observer Meta continúa siendo la fuente de conversaciones.

CREATE TABLE IF NOT EXISTS crm_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Lima',
  currency text NOT NULL DEFAULT 'PEN',
  business_hours jsonb NOT NULL DEFAULT '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO crm_organizations (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Agua ReNew')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','ADVISOR')),
  active boolean NOT NULL DEFAULT TRUE,
  must_change_password boolean NOT NULL DEFAULT TRUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_users_email_unique ON crm_users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_sessions_user_active_idx ON crm_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_login_attempts (
  id bigserial PRIMARY KEY,
  identity text NOT NULL,
  ip_address text NOT NULL,
  succeeded boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_login_attempts_window_idx ON crm_login_attempts (ip_address, attempted_at DESC);

CREATE TABLE IF NOT EXISTS crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  tax_id text,
  owner_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_companies_name_idx ON crm_companies (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  source_lead_id uuid UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
  company_id uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  email text,
  phone_e164 text,
  source_channel text,
  source_external_id text,
  consent_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (consent_status IN ('UNKNOWN','GRANTED','REVOKED')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_contacts_search_idx ON crm_contacts (organization_id, lower(display_name));
CREATE INDEX IF NOT EXISTS crm_contacts_phone_idx ON crm_contacts (phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT FALSE,
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO crm_pipelines (id, organization_id, name, is_default)
VALUES ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Pipeline comercial', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  name text NOT NULL,
  position integer NOT NULL,
  probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  color text NOT NULL DEFAULT '#0066cc',
  terminal_kind text CHECK (terminal_kind IS NULL OR terminal_kind IN ('WON','LOST')),
  active boolean NOT NULL DEFAULT TRUE,
  UNIQUE (pipeline_id, stage_key),
  UNIQUE (pipeline_id, position)
);

INSERT INTO crm_pipeline_stages (id, pipeline_id, stage_key, name, position, probability, color, terminal_kind) VALUES
  ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000010','NEW','Nuevo',1,5,'#007bff',NULL),
  ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000010','QUALIFICATION','Calificación',2,15,'#67c3f3',NULL),
  ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000010','READY_WHATSAPP','Listo para WhatsApp',3,30,'#00a9a5',NULL),
  ('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000010','CONTACTED','Contactado',4,45,'#00c853',NULL),
  ('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000010','QUOTATION','Cotización',5,60,'#f59e0b',NULL),
  ('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000010','NEGOTIATION','Negociación',6,80,'#8b5cf6',NULL),
  ('00000000-0000-4000-8000-000000000107','00000000-0000-4000-8000-000000000010','WON','Ganado',7,100,'#008f3e','WON'),
  ('00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-000000000010','LOST','Perdido',8,0,'#b42318','LOST')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  source_lead_id uuid UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE RESTRICT,
  pipeline_id uuid NOT NULL REFERENCES crm_pipelines(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
  owner_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  product text,
  modality text,
  quantity numeric,
  estimated_value numeric(14,2),
  currency text NOT NULL DEFAULT 'PEN',
  probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date date,
  next_action text,
  next_action_at timestamptz,
  lifecycle_status text NOT NULL DEFAULT 'OPEN' CHECK (lifecycle_status IN ('OPEN','WON','LOST','ARCHIVED')),
  loss_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_opportunities_stage_idx ON crm_opportunities (organization_id, stage_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_opportunities_owner_idx ON crm_opportunities (owner_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_opportunities_next_action_idx ON crm_opportunities (next_action_at) WHERE deleted_at IS NULL AND lifecycle_status = 'OPEN';

CREATE TABLE IF NOT EXISTS crm_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE','CANCELLED')),
  automation_key text,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_tasks_assignee_due_idx ON crm_tasks (assigned_to, status, due_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#0066cc',
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS crm_opportunity_tags (
  opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (opportunity_id, tag_id)
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activities_opportunity_idx ON crm_activities (opportunity_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS crm_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  quote_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
  currency text NOT NULL DEFAULT 'PEN',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_until date,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS crm_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  position integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS crm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_notifications_user_unread_idx ON crm_notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_audit_log (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_audit_created_idx ON crm_audit_log (organization_id, created_at DESC);

-- Espejo inicial: conserva todos los leads y archiva los no comerciales.
INSERT INTO crm_contacts
  (organization_id, source_lead_id, display_name, phone_e164, source_channel, source_external_id, created_at, updated_at)
SELECT '00000000-0000-4000-8000-000000000001', l.id,
       COALESCE(NULLIF(btrim(l.meta_username), ''), 'Prospecto de Meta'),
       l.phone_e164, l.source_channel, l.source_conversation_id, l.created_at, l.updated_at
FROM leads l
ON CONFLICT (source_lead_id) DO NOTHING;

INSERT INTO crm_opportunities
  (organization_id, source_lead_id, contact_id, pipeline_id, stage_id, title, product, modality,
   probability, lifecycle_status, loss_reason, created_at, updated_at)
SELECT '00000000-0000-4000-8000-000000000001', l.id, c.id,
       '00000000-0000-4000-8000-000000000010',
       CASE
         WHEN l.status = 'READY_FOR_WHATSAPP' THEN '00000000-0000-4000-8000-000000000103'::uuid
         WHEN l.status IN ('CONTACT_OPENED','CONTACTED_MANUALLY') THEN '00000000-0000-4000-8000-000000000104'::uuid
         WHEN l.status IN ('COLLECTING','WAITING_PHONE') THEN '00000000-0000-4000-8000-000000000102'::uuid
         WHEN l.status = 'CLOSED' AND l.conversation_type = 'commercial_lead' THEN '00000000-0000-4000-8000-000000000108'::uuid
         ELSE '00000000-0000-4000-8000-000000000101'::uuid
       END,
       'Oportunidad · ' || COALESCE(NULLIF(btrim(l.meta_username), ''), 'Prospecto de Meta'),
       l.product, l.modality,
       CASE WHEN l.status = 'READY_FOR_WHATSAPP' THEN 30 WHEN l.status IN ('COLLECTING','WAITING_PHONE') THEN 15 ELSE 5 END,
       CASE
         WHEN l.conversation_type IN ('spam_or_irrelevant','support_or_complaint','service_provider','existing_customer','employment_or_job') THEN 'ARCHIVED'
         WHEN l.status = 'CLOSED' THEN 'LOST'
         ELSE 'OPEN'
       END,
       CASE WHEN l.status = 'CLOSED' THEN 'Cierre histórico importado' ELSE NULL END,
       l.created_at, l.updated_at
FROM leads l
JOIN crm_contacts c ON c.source_lead_id = l.id
ON CONFLICT (source_lead_id) DO NOTHING;
