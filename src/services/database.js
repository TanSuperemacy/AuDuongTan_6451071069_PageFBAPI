const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "fb_api_db",
  user: process.env.DB_USER || "fb_api_user",
  password: process.env.DB_PASSWORD || "fb_api_pass",
});

pool.on("error", (err) => {
  console.error("[Database] Lỗi kết nối:", err.message);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        command_id VARCHAR(100) PRIMARY KEY,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'completed'
      );

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

      CREATE INDEX IF NOT EXISTS idx_comments_comment_id ON comments(comment_id);
      CREATE INDEX IF NOT EXISTS idx_idempotency_command_id ON idempotency_keys(command_id);
    `);
    console.log("[Database] ✅ Bảng đã được khởi tạo.");
  } finally {
    client.release();
  }
}

async function isCommandProcessed(commandId) {
  const result = await pool.query(
    "SELECT status FROM idempotency_keys WHERE command_id = $1",
    [commandId]
  );
  return result.rows.length > 0;
}

async function markCommandProcessed(commandId, status = "completed") {
  await pool.query(
    `INSERT INTO idempotency_keys (command_id, status)
     VALUES ($1, $2)
     ON CONFLICT (command_id) DO NOTHING`,
    [commandId, status]
  );
}

async function saveComment(commentId, postId, message, intent = null, sentiment = null) {
  await pool.query(
    `INSERT INTO comments (comment_id, post_id, message, intent, sentiment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (comment_id) DO NOTHING`,
    [commentId, postId, message, intent, sentiment]
  );
}

async function updateCommentStatus(commentId, status) {
  await pool.query(
    "UPDATE comments SET status = $1 WHERE comment_id = $2",
    [status, commentId]
  );
}

async function getCommentStats() {
  const result = await pool.query(`
    SELECT status, COUNT(*) as count
    FROM comments
    GROUP BY status
  `);
  return result.rows;
}

module.exports = {
  pool,
  initDatabase,
  isCommandProcessed,
  markCommandProcessed,
  saveComment,
  updateCommentStatus,
  getCommentStats,
};
