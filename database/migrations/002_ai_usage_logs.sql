CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  provider text,
  model text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  intent text,
  operation text,
  success boolean NOT NULL,
  fallback_used boolean NOT NULL DEFAULT false,
  error_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_conversation_created_idx
  ON ai_usage_logs (conversation_id, created_at);
