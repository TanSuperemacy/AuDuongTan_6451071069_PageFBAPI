require("dotenv").config({ path: "../../../.env" });
const { startCoreService } = require("./services/coreHandler");

const PORT = process.env.CORE_SERVICE_PORT || 3002;

async function main() {
  console.log(`[CoreService] Khởi động trên port ${PORT}...`);
  await startCoreService();
}

main().catch((err) => {
  console.error("[CoreService] Lỗi khởi động:", err);
  process.exit(1);
});
