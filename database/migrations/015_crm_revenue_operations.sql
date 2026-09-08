-- Fase 3: catálogo, agenda, automatizaciones, comunicaciones y operación de ingresos.
CREATE TABLE IF NOT EXISTS crm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  product_key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT TRUE,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (organization_id, product_key)
);
CREATE INDEX IF NOT EXISTS crm_products_catalog_idx
  ON crm_products (organization_id, active DESC, category, name) WHERE deleted_at IS NULL;

INSERT INTO crm_products (organization_id, product_key, name, category)
VALUES
  ('00000000-0000-4000-8000-000000000001','maquila_bidon_20l','Bidón recargable 20 L','Maquila'),
  ('00000000-0000-4000-8000-000000000001','maquila_botella_1l_fliptop','Botella 1 L','Maquila'),
  ('00000000-0000-4000-8000-000000000001','maquila_botella_625ml_rosca','Botella 625 ml','Maquila'),
  ('00000000-0000-4000-8000-000000000001','maquila_galonera_10_5l','Galonera 10.5 L','Maquila'),
  ('00000000-0000-4000-8000-000000000001','distribution_bidon_20l','Recarga 20 L','Distribución'),
  ('00000000-0000-4000-8000-000000000001','distribution_bidon_20l_new','Bidón nuevo 20 L','Distribución'),
  ('00000000-0000-4000-8000-000000000001','distribution_botella_1l_fliptop','Botella 1 L','Distribución'),
  ('00000000-0000-4000-8000-000000000001','distribution_botella_625ml_rosca','Botella 625 ml','Distribución'),
  ('00000000-0000-4000-8000-000000000001','distribution_galonera_10_5l','Galonera 10.5 L','Distribución'),
  ('00000000-0000-4000-8000-000000000001','final_customer_bidon_20l_refill','Recarga 20 L','Consumo final'),
  ('00000000-0000-4000-8000-000000000001','final_customer_bidon_20l_new','Bidón completo 20 L','Consumo final')
ON CONFLICT (organization_id, product_key) DO UPDATE SET
  name=EXCLUDED.name, category=EXCLUDED.category, updated_at=now();

ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS parent_quote_id uuid REFERENCES crm_quotes(id) ON DELETE SET NULL;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS terms text;
ALTER TABLE crm_quotes ADD COLUMN IF NOT EXISTS discount_total numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE crm_quote_items ADD COLUMN IF NOT EXISTS base_unit_price numeric(14,4);
ALTER TABLE crm_quote_items ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100);
UPDATE crm_quote_items SET base_unit_price=unit_price WHERE base_unit_price IS NULL;

CREATE TABLE IF NOT EXISTS crm_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('CALL','MEETING','FOLLOW_UP','DELIVERY','OTHER')),
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT FALSE,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS crm_calendar_events_range_idx
  ON crm_calendar_events (organization_id, starts_at, ends_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_calendar_events_assignee_idx
  ON crm_calendar_events (assigned_to, starts_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('STAGE_ENTERED','TASK_OVERDUE','OPPORTUNITY_IDLE','QUOTE_ACCEPTED')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_type text NOT NULL CHECK (action_type IN ('CREATE_TASK','NOTIFY_OWNER','NOTIFY_SUPERVISOR','ASSIGN_ROUND_ROBIN')),
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT TRUE,
  last_run_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_automation_rules_active_idx
  ON crm_automation_rules (organization_id, active, trigger_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  subject text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT TRUE,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS crm_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  template_id uuid REFERENCES crm_communication_templates(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','INTERNAL')),
  direction text NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND','INBOUND')),
  recipient text,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','HANDED_OFF','SENT','FAILED','CANCELLED')),
  provider_message_id text,
  sent_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_communications_contact_idx
  ON crm_communications (contact_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE SEQUENCE IF NOT EXISTS crm_order_number_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS crm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  quote_id uuid UNIQUE REFERENCES crm_quotes(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES crm_contacts(id) ON DELETE RESTRICT,
  order_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','IN_PREPARATION','READY','DELIVERED','CANCELLED')),
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PARTIAL','PAID','REFUNDED')),
  currency text NOT NULL DEFAULT 'PEN',
  total numeric(14,2) NOT NULL DEFAULT 0,
  delivery_at timestamptz,
  delivery_address text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_orders_status_idx
  ON crm_orders (organization_id, status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES crm_orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  position integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_order_items_position_unique ON crm_order_items (order_id, position);

CREATE TABLE IF NOT EXISTS crm_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES crm_organizations(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES crm_orders(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('TRANSFER','CASH','CARD','YAPE','PLIN','OTHER')),
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES crm_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS first_responded_at timestamptz;
ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS won_at timestamptz;

INSERT INTO crm_automation_rules (organization_id,name,trigger_type,trigger_config,action_type,action_config,created_by)
SELECT '00000000-0000-4000-8000-000000000001','Alertar seguimiento vencido','TASK_OVERDUE','{}','NOTIFY_OWNER','{}',u.id
FROM crm_users u WHERE u.organization_id='00000000-0000-4000-8000-000000000001' AND u.role='ADMIN' AND u.active=TRUE
AND NOT EXISTS (SELECT 1 FROM crm_automation_rules WHERE organization_id=u.organization_id AND name='Alertar seguimiento vencido')
ORDER BY u.created_at LIMIT 1;
