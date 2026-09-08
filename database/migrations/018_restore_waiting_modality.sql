-- WAITING_MODALITY sigue siendo un estado canónico del dominio y es utilizado
-- cuando el teléfono ya fue capturado pero aún falta definir la modalidad.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_valid;
ALTER TABLE leads ADD CONSTRAINT leads_status_valid CHECK (status IN
  ('NEW','COLLECTING','WAITING_PHONE','WAITING_MODALITY','READY_FOR_WHATSAPP','CONTACT_OPENED','CONTACTED_MANUALLY','CLOSED'));
