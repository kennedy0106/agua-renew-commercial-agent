-- Conserva la referencia comercial que Meta adjunta a una conversación iniciada
-- desde anuncio, publicación o enlace. El JSON permite aceptar nuevos campos de
-- Meta sin perder compatibilidad con los webhooks ya almacenados.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_source_context_object
    CHECK (jsonb_typeof(source_context) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS leads_source_ad_id_idx
  ON leads (source_ad_id) WHERE source_ad_id IS NOT NULL;
