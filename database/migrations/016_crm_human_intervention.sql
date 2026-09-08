-- Centro de intervención humana Meta → CRM → WhatsApp.
-- Mantiene el origen observado y añade estado explícito de revisión comercial.

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS qualification_status text NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN IF NOT EXISTS intent_level text NOT NULL DEFAULT 'EXPLORING',
  ADD COLUMN IF NOT EXISTS data_quality text NOT NULL DEFAULT 'INSUFFICIENT',
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS automation_summary text,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS classification_source text NOT NULL DEFAULT 'IMPORTED',
  ADD COLUMN IF NOT EXISTS classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_handoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_meta_message_at timestamptz;

DO $$ BEGIN
  ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_qualification_status_valid
    CHECK (qualification_status IN ('UNREVIEWED','NEEDS_DATA','READY','CLAIMED','HANDED_OFF'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_intent_level_valid
    CHECK (intent_level IN ('EXPLORING','INTERESTED','QUALIFIED','READY_TO_BUY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_data_quality_valid
    CHECK (data_quality IN ('INSUFFICIENT','PARTIAL','COMPLETE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_priority_score_valid
    CHECK (priority_score BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE crm_opportunities ADD CONSTRAINT crm_opportunities_classification_source_valid
    CHECK (classification_source IN ('IMPORTED','AUTOMATION','HUMAN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE crm_opportunities o SET
  qualification_status = CASE
    WHEN l.status IN ('CONTACT_OPENED','CONTACTED_MANUALLY') THEN 'HANDED_OFF'
    WHEN l.status = 'READY_FOR_WHATSAPP' AND l.phone_e164 IS NOT NULL THEN 'READY'
    WHEN l.status IN ('COLLECTING','WAITING_PHONE','WAITING_MODALITY') THEN 'NEEDS_DATA'
    ELSE 'UNREVIEWED' END,
  intent_level = CASE
    WHEN l.status = 'READY_FOR_WHATSAPP' THEN 'READY_TO_BUY'
    WHEN l.conversation_type = 'commercial_lead' AND l.product IS NOT NULL AND l.modality IS NOT NULL THEN 'QUALIFIED'
    WHEN l.conversation_type = 'commercial_lead' OR l.product IS NOT NULL OR l.modality IS NOT NULL THEN 'INTERESTED'
    ELSE 'EXPLORING' END,
  data_quality = CASE
    WHEN l.phone_e164 IS NOT NULL AND l.product IS NOT NULL AND l.modality IS NOT NULL THEN 'COMPLETE'
    WHEN l.phone_e164 IS NOT NULL OR l.product IS NOT NULL OR l.modality IS NOT NULL THEN 'PARTIAL'
    ELSE 'INSUFFICIENT' END,
  priority_score = LEAST(100,
    CASE WHEN l.phone_e164 IS NOT NULL THEN 25 ELSE 0 END +
    CASE WHEN l.product IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN l.modality IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN l.conversation_type = 'commercial_lead' THEN 20 ELSE 0 END +
    CASE WHEN l.status = 'READY_FOR_WHATSAPP' THEN 15 ELSE 0 END),
  extracted_fields = jsonb_strip_nulls(jsonb_build_object(
    'phone', l.phone_e164, 'product', l.product, 'modality', l.modality,
    'conversationType', l.conversation_type, 'confidence', l.classification_confidence)),
  classification_source = CASE WHEN l.last_processed_at IS NOT NULL THEN 'AUTOMATION' ELSE 'IMPORTED' END,
  classified_at = COALESCE(l.last_processed_at, l.updated_at),
  whatsapp_handoff_at = COALESCE(o.whatsapp_handoff_at, l.whatsapp_opened_at),
  last_meta_message_at = inbound.last_inbound_at,
  review_reason = CASE
    WHEN l.phone_e164 IS NULL THEN 'Falta un teléfono válido'
    WHEN l.modality IS NULL THEN 'Falta confirmar la modalidad comercial'
    WHEN l.product IS NULL THEN 'Falta confirmar el producto de interés'
    WHEN l.status = 'READY_FOR_WHATSAPP' THEN 'Información suficiente para revisión humana'
    ELSE 'Revisar clasificación automática' END
FROM leads l
LEFT JOIN LATERAL (
  SELECT max(COALESCE(m.source_created_at, m.created_at)) AS last_inbound_at
  FROM lead_messages m WHERE m.lead_id = l.id AND m.direction = 'inbound'
) inbound ON TRUE
WHERE o.source_lead_id = l.id;

CREATE INDEX IF NOT EXISTS crm_opportunities_intervention_idx
  ON crm_opportunities (qualification_status, priority_score DESC, last_meta_message_at DESC)
  WHERE deleted_at IS NULL AND lifecycle_status = 'OPEN';
