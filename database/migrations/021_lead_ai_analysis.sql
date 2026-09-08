-- Resultado estructurado y auditable del análisis de la conversación.
-- El borrador nunca se envía automáticamente: el CRM exige revisión humana.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS analysis_summary text,
  ADD COLUMN IF NOT EXISTS suggested_whatsapp_message text,
  ADD COLUMN IF NOT EXISTS analysis_source varchar(40),
  ADD COLUMN IF NOT EXISTS analysis_provider varchar(80),
  ADD COLUMN IF NOT EXISTS analysis_model varchar(160),
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_ai_analysis_object
    CHECK (jsonb_typeof(ai_analysis) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS leads_ai_analyzed_at_idx
  ON leads (ai_analyzed_at DESC) WHERE ai_analyzed_at IS NOT NULL;
