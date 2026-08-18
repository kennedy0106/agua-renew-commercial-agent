-- Supports databases created before message ordering used sequence_no.
CREATE SEQUENCE IF NOT EXISTS messages_sequence_no_seq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sequence_no'
  ) THEN
    ALTER TABLE messages ADD COLUMN sequence_no bigint;
    ALTER TABLE messages ALTER COLUMN sequence_no SET DEFAULT nextval('messages_sequence_no_seq');
    UPDATE messages SET sequence_no = nextval('messages_sequence_no_seq') WHERE sequence_no IS NULL;
    ALTER TABLE messages ALTER COLUMN sequence_no SET NOT NULL;
  END IF;
END $$;

SELECT setval('messages_sequence_no_seq', GREATEST((SELECT COALESCE(MAX(sequence_no), 1) FROM messages), 1), true);
CREATE UNIQUE INDEX IF NOT EXISTS messages_sequence_no_unique_idx ON messages (sequence_no);
CREATE INDEX IF NOT EXISTS messages_conversation_order_idx ON messages (conversation_id, sequence_no);
