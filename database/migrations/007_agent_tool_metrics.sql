ALTER TABLE conversation_turn_metrics
  ADD COLUMN IF NOT EXISTS tool_latency_ms integer NOT NULL DEFAULT 0;
