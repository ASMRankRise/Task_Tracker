ALTER TABLE chat_messages
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'
  CHECK(message_type IN ('text', 'sticker'));

ALTER TABLE chat_messages
  ADD COLUMN sticker_id TEXT;
