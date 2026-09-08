ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS analysis_version bigint;
ALTER TABLE lead_analysis_jobs ADD COLUMN IF NOT EXISTS lease_token uuid;

CREATE INDEX IF NOT EXISTS lead_messages_analysis_coverage_idx
  ON lead_messages (lead_id, analysis_version)
  WHERE direction = 'inbound';

UPDATE crm_opportunities SET field_provenance = field_provenance || jsonb_strip_nulls(jsonb_build_object(
  'product', CASE WHEN product IS NOT NULL THEN jsonb_build_object('source','LEGACY_HUMAN_EVIDENCE','confirmedAt',classified_at) END,
  'modality', CASE WHEN modality IS NOT NULL THEN jsonb_build_object('source','LEGACY_HUMAN_EVIDENCE','confirmedAt',classified_at) END))
WHERE classification_source='HUMAN' AND field_provenance='{}'::jsonb;

UPDATE crm_contacts c SET field_provenance = c.field_provenance || jsonb_strip_nulls(jsonb_build_object(
  'displayName', jsonb_build_object('source','LEGACY_HUMAN_EVIDENCE'),
  'phoneE164', CASE WHEN c.phone_e164 IS NOT NULL THEN jsonb_build_object('source','LEGACY_HUMAN_EVIDENCE') END))
WHERE c.field_provenance='{}'::jsonb AND EXISTS (
  SELECT 1 FROM crm_audit_log a WHERE a.entity_type='contact' AND a.entity_id=c.id::text AND a.action='CONTACT_UPDATED');

-- Conservador: mensajes históricos sin cobertura quedan pendientes. No se
-- atribuye autoría ni se altera ningún dato comercial existente.
INSERT INTO lead_analysis_jobs (lead_id, requested_version, completed_version, status, next_attempt_at)
SELECT l.id, 1, 0, 'PENDING', now()
FROM leads l
WHERE EXISTS (SELECT 1 FROM lead_messages m WHERE m.lead_id=l.id AND m.direction='inbound' AND m.analysis_version IS NULL)
ON CONFLICT (lead_id) DO UPDATE SET
  status = CASE WHEN lead_analysis_jobs.status='PROCESSING' THEN 'PROCESSING' ELSE 'PENDING' END,
  next_attempt_at = CASE WHEN lead_analysis_jobs.status='PROCESSING' THEN lead_analysis_jobs.next_attempt_at ELSE now() END;
