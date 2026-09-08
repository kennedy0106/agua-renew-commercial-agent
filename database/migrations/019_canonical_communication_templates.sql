-- Plantillas vigentes para el handoff comercial. Los mensajes históricos se
-- preservan sin reescritura para mantener la fidelidad del registro importado.
INSERT INTO crm_communication_templates
  (organization_id, name, channel, body)
SELECT
  '00000000-0000-4000-8000-000000000001',
  'Calificación inicial',
  'WHATSAPP',
  'Gracias por comunicarse con Agua ReNew. Para orientarle correctamente, indíquenos qué presentación necesita y si busca maquila, distribución o consumo final.'
WHERE NOT EXISTS (
  SELECT 1 FROM crm_communication_templates
  WHERE organization_id = '00000000-0000-4000-8000-000000000001'
    AND name = 'Calificación inicial'
    AND deleted_at IS NULL
);

INSERT INTO crm_communication_templates
  (organization_id, name, channel, body)
SELECT
  '00000000-0000-4000-8000-000000000001',
  'Continuidad por WhatsApp',
  'WHATSAPP',
  'Para continuar con la atención comercial, por favor compártanos su número de WhatsApp. Un asesor se pondrá en contacto con usted.'
WHERE NOT EXISTS (
  SELECT 1 FROM crm_communication_templates
  WHERE organization_id = '00000000-0000-4000-8000-000000000001'
    AND name = 'Continuidad por WhatsApp'
    AND deleted_at IS NULL
);
