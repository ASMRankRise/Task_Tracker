CREATE TABLE IF NOT EXISTS custom_stickers (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL CHECK(length(label) >= 1 AND length(label) <= 40),
    mime_type TEXT NOT NULL CHECK(mime_type IN ('image/webp', 'image/png', 'image/gif')),
    image_data TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_stickers_created ON custom_stickers(created_at DESC);
