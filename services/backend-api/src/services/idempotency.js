const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "fb_api_db",
  user: process.env.DB_USER || "fb_api_user",
  password: process.env.DB_PASSWORD || "fb_api_pass",
});

async function isCommandProcessed(commandId) {
  const result = await pool.query("SELECT status FROM idempotency_keys WHERE command_id = $1", [commandId]);
  return result.rows.length > 0;
}

async function markCommandProcessed(commandId, status = "completed") {
  await pool.query("INSERT INTO idempotency_keys (command_id, status) VALUES ($1, $2) ON CONFLICT (command_id) DO NOTHING", [commandId, status]);
}

module.exports = { isCommandProcessed, markCommandProcessed };
