-- Runtime observer para Meta Business Agent. Aditiva e idempotente.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS processing_version text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_processed_at timestamptz;

UPDATE leads SET status = 'COLLECTING' WHERE status = 'WAITING_MODALITY';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_valid;
ALTER TABLE leads ADD CONSTRAINT leads_status_valid CHECK (status IN
  ('NEW','COLLECTING','WAITING_PHONE','READY_FOR_WHATSAPP','CONTACT_OPENED','CONTACTED_MANUALLY','CLOSED'));

COMMENT ON COLUMN lead_messages.actor_type IS
  'Actor observado: user, meta_business_agent, page u operator legacy.';
