-- Fiabilidad operacional de leads, sincronización histórica y outbox Meta.
-- Aditiva e idempotente: conserva todos los datos existentes.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS modality_ask_count integer NOT NULL DEFAULT 0;

ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS purpose text;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS last_error_message text;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS source_created_at timestamptz;
ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- Históricos recuperados desde Meta ya existían en la plataforma. Los inbound
-- se consideran recibidos y los outbound importados, enviados.
UPDATE lead_messages
SET delivery_status = CASE WHEN direction = 'inbound' THEN 'RECEIVED' ELSE 'SENT' END,
    sent_at = CASE WHEN direction = 'outbound' THEN created_at ELSE sent_at END,
    source_created_at = COALESCE(source_created_at, created_at),
    actor_type = CASE
      WHEN direction = 'outbound' AND actor_type = 'automation'
           AND lead_id IN (SELECT id FROM leads WHERE source_origin = 'imported')
        THEN 'page'
      ELSE actor_type
    END
WHERE delivery_status IS NULL;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_modality_ask_count_nonnegative
    CHECK (modality_ask_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_status_valid CHECK (status IN
    ('NEW','COLLECTING','WAITING_PHONE','WAITING_MODALITY','READY_FOR_WHATSAPP','CONTACT_OPENED','CONTACTED_MANUALLY','CLOSED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_control_mode_valid
    CHECK (control_mode IN ('AUTO','HUMAN','PAUSED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_channel_valid
    CHECK (source_channel IN ('instagram','facebook_messenger'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_origin_valid CHECK (source_origin IS NULL OR source_origin IN
    ('ad_automation','comment_trigger','organic_dm','manual_contact','unknown','imported','webhook'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_product_valid
    CHECK (product IS NULL OR product IN ('20l','1l','625ml','10_5l'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_modality_valid CHECK (modality IS NULL OR modality IN
    ('maquila','distribution_agua_renew','final_customer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_conversation_type_valid CHECK (conversation_type IS NULL OR conversation_type IN
    ('commercial_lead','service_provider','existing_customer','support_or_complaint','employment_or_job','spam_or_irrelevant','unclear'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE lead_messages ADD CONSTRAINT lead_messages_delivery_status_valid CHECK (delivery_status IN
    ('RECEIVED','PENDING','SENDING','RETRY_WAIT','SENT','FAILED','UNKNOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE lead_messages ADD CONSTRAINT lead_messages_attempt_count_nonnegative
    CHECK (attempt_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La auditoría previa confirmó que no existen duplicados en producción.
CREATE UNIQUE INDEX IF NOT EXISTS leads_channel_conversation_unique
  ON leads (source_channel, source_conversation_id);
CREATE INDEX IF NOT EXISTS lead_messages_outbox_due_idx
  ON lead_messages (delivery_status, next_attempt_at, created_at)
  WHERE direction = 'outbound';

