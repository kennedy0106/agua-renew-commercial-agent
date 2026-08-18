ALTER TABLE conversation_turn_metrics
  ADD COLUMN IF NOT EXISTS dialogue_act text,
  ADD COLUMN IF NOT EXISTS commercial_intent text,
  ADD COLUMN IF NOT EXISTS technical_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clarification_required boolean NOT NULL DEFAULT false;
