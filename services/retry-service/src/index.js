require("dotenv").config({ path: "../../../.env" });
const { startRetryService } = require("./services/retryHandler");

const PORT = process.env.RETRY_SERVICE_PORT || 3003;

async function main() {
  console.log(`[RetryService] Khởi động trên port ${PORT}...`);
  await startRetryService();
}

main().catch((err) => {
  console.error("[RetryService] Lỗi khởi động:", err);
  process.exit(1);
});
