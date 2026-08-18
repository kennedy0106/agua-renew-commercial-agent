ALTER TABLE human_handoffs
  ADD COLUMN IF NOT EXISTS lead_summary_json jsonb,
  ADD COLUMN IF NOT EXISTS category text;
