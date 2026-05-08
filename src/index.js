require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const pageRouter = require("./routes/page");
const webhookRouter = require("./routes/webhook");
const errorHandler = require("./middleware/errorHandler");
const { connectProducer } = require("./services/kafkaProducer");
const { startCoreService } = require("./services/coreService");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Swagger UI ────────────────────────────────────────────────────────────────
const swaggerDoc = YAML.load(path.join(__dirname, "../swagger.yaml"));
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDoc, {
    customSiteTitle: "Facebook Page API Docs",
  })
);

// ── Middleware ────────────────────────────────────────────────────────────────
// LƯU Ý: express.json() và express.urlencoded() được đặt TRƯỚC các route thông thường.
// Riêng route /webhook sử dụng express.raw() nội bộ để đọc raw body cho việc
// xác thực chữ ký X-Hub-Signature-256, nên KHÔNG áp dụng express.json() cho nó.
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/page", pageRouter);

// Webhook route — phải đăng ký SAU express.json() nhưng route tự xử lý body riêng
app.use("/webhook", webhookRouter);

// Redirect trang chủ vào Swagger docs
app.get("/", (req, res) => {
  res.redirect("/docs");
});

// ── Error handler (phải đặt cuối cùng) ───────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
async function startServer() {
  // Kết nối Kafka Producer trước khi lắng nghe request
  await connectProducer();

  // Khởi động Core Service (Kafka Consumer) xử lý sự kiện
  await startCoreService();

  app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log(`Swagger UI:        http://localhost:${PORT}/docs`);
    console.log(`Webhook endpoint:  http://localhost:${PORT}/webhook`);
  });
}

startServer();
