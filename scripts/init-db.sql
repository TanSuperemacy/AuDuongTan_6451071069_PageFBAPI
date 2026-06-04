-- Tạo bảng idempotency_keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
    command_id VARCHAR(100) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
);

-- Tạo bảng comments
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    comment_id VARCHAR(100) UNIQUE NOT NULL,
    post_id VARCHAR(100) NOT NULL,
    message TEXT,
    intent VARCHAR(50),
    sentiment VARCHAR(20),
    status VARCHAR(20) DEFAULT 'received',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_comments_comment_id ON comments(comment_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_command_id ON idempotency_keys(command_id);
