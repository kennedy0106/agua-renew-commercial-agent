CREATE TABLE IF NOT EXISTS conversation_turn_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resolution text NOT NULL,
  intent text,
  fallback_reason text,
  ai_call_count integer NOT NULL DEFAULT 0,
  total_latency_ms integer NOT NULL,
  ai_latency_ms integer NOT NULL DEFAULT 0,
  commercial_service_latency_ms integer NOT NULL DEFAULT 0,
  repository_read_latency_ms integer NOT NULL DEFAULT 0,
  repository_write_latency_ms integer NOT NULL DEFAULT 0,
  response_composer_latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_turn_metrics_conversation_created_idx
  ON conversation_turn_metrics (conversation_id, created_at, id);
