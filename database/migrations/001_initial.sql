CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  external_id text NOT NULL,
  name text,
  company text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_channel_external_id_unique UNIQUE (channel, external_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'human', 'waiting', 'closed')),
  current_flow text NOT NULL,
  current_step text NOT NULL,
  assigned_agent text,
  state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_customer_channel_updated_idx
  ON conversations (customer_id, channel, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_customer_id_idx ON conversations (customer_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  external_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type text NOT NULL,
  content text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_order_idx
  ON messages (conversation_id, sequence_no);
CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_external_id_unique
  ON messages (conversation_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'completed',
  validated_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_requests_customer_id_idx ON quote_requests (customer_id);
CREATE INDEX IF NOT EXISTS quote_requests_conversation_id_idx ON quote_requests (conversation_id);

CREATE TABLE IF NOT EXISTS human_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  source_result_status text NOT NULL,
  ambiguity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS human_handoffs_conversation_created_idx
  ON human_handoffs (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS human_handoffs_customer_id_idx ON human_handoffs (customer_id);
