-- Archiva de forma reversible conversaciones importadas de campañas claramente
-- ajenas a Agua ReNew. No elimina leads, mensajes ni contactos.

CREATE TEMP TABLE crm_foreign_context_targets ON COMMIT DROP AS
SELECT DISTINCT l.id AS lead_id
FROM leads l
WHERE EXISTS (
  SELECT 1
  FROM lead_messages m
  WHERE m.lead_id = l.id
    AND m.content ~* '(alquiler[[:space:]]+de[[:space:]]+(veh[ií]culos?|autos?|minivanes?|camiones?)|minivanes?.{0,48}(toneladas?|alquiler)|camiones?.{0,48}(toneladas?|alquiler))'
)
AND NOT EXISTS (
  SELECT 1
  FROM lead_messages m
  WHERE m.lead_id = l.id
    AND m.direction = 'inbound'
    AND m.content ~* '(agua[[:space:]]*renew|agua[[:space:]]+embotellada|bid[oó]n|botellas?|galonera|maquila|marca[[:space:]]+propia)'
);

INSERT INTO lead_events (lead_id, event_type, payload)
SELECT t.lead_id, 'DOMAIN_CONTEXT_QUARANTINED',
       jsonb_build_object('reason', 'foreign_business_context', 'migration', '017_crm_domain_guard')
FROM crm_foreign_context_targets t
WHERE NOT EXISTS (
  SELECT 1 FROM lead_events e
  WHERE e.lead_id = t.lead_id AND e.event_type = 'DOMAIN_CONTEXT_QUARANTINED'
);

UPDATE leads l
SET conversation_type = 'spam_or_irrelevant',
    classification_confidence = GREATEST(COALESCE(classification_confidence, 0), 0.95),
    status = 'CLOSED',
    updated_at = now()
FROM crm_foreign_context_targets t
WHERE l.id = t.lead_id;

INSERT INTO crm_audit_log (organization_id, action, entity_type, entity_id, changes)
SELECT o.organization_id, 'OPPORTUNITY_ARCHIVED_FOREIGN_CONTEXT', 'opportunity', o.id,
       jsonb_build_object('previousLifecycleStatus', o.lifecycle_status, 'reason', 'foreign_business_context')
FROM crm_opportunities o
JOIN crm_foreign_context_targets t ON t.lead_id = o.source_lead_id
WHERE o.lifecycle_status = 'OPEN' AND o.classification_source <> 'HUMAN';

UPDATE crm_opportunities o
SET lifecycle_status = 'ARCHIVED',
    loss_reason = 'Conversación ajena al negocio',
    review_reason = 'Archivada automáticamente: la conversación pertenece a otra campaña o rubro',
    version = version + 1,
    updated_at = now()
FROM crm_foreign_context_targets t
WHERE o.source_lead_id = t.lead_id
  AND o.lifecycle_status = 'OPEN'
  AND o.classification_source <> 'HUMAN';
