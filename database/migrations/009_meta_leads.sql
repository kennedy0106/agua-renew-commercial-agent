-- Capa de captación Meta → leads (Nueva arquitectura, Fase 1).
-- Idempotente: puede aplicarse sobre una base existente.

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_channel text NOT NULL,
  source_origin text,
  source_ad_id text,
  source_conversation_id text NOT NULL,

  meta_user_id text,
  meta_username text,

  conversation_type text,
  classification_confidence numeric,

  automation_triggered boolean NOT NULL DEFAULT FALSE,

  phone_raw text,
  phone_e164 text,

  product text,
  modality text,

  status text NOT NULL DEFAULT 'NEW',
  control_mode text NOT NULL DEFAULT 'AUTO',

  initial_social_message_sent boolean NOT NULL DEFAULT FALSE,
  clarification_count integer NOT NULL DEFAULT 0,

  last_inbound_at timestamptz,
  whatsapp_opened_at timestamptz,
  contacted_at timestamptz,
  meta_confirmation_sent_at timestamptz,
  meta_confirmation_blocked boolean NOT NULL DEFAULT FALSE,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_status_created_idx ON leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_e164_idx ON leads (phone_e164);
CREATE INDEX IF NOT EXISTS leads_channel_conversation_idx ON leads (source_channel, source_conversation_id);

CREATE TABLE IF NOT EXISTS lead_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  actor_type text,
  actor_id text,
  external_message_id text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotencia: el mismo external_message_id de Meta nunca se procesa dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS lead_messages_external_id_unique
  ON lead_messages (external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_messages_lead_order_idx ON lead_messages (lead_id, sequence_no);

CREATE TABLE IF NOT EXISTS lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_events_lead_created_idx ON lead_events (lead_id, created_at);

-- Auditoría de cambios de teléfono (correcciones del prospecto o del operador).
CREATE TABLE IF NOT EXISTS lead_phone_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  previous_phone text,
  new_phone text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_phone_history_lead_idx ON lead_phone_history (lead_id, created_at);
