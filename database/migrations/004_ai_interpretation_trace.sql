ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS raw_response text,
  ADD COLUMN IF NOT EXISTS parsed_response_json jsonb,
  ADD COLUMN IF NOT EXISTS parser_rejection text,
  ADD COLUMN IF NOT EXISTS fallback_reason text;
