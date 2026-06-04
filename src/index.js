require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const pageRouter = require("./routes/page");
const webhookRouter = require("./routes/webhook");
const dashboardRouter = require("./routes/dashboard");
const errorHandler = require("./middleware/errorHandler");
const loggingMiddleware = require("./middleware/logging");
const rateLimiter = require("./middleware/rateLimiter");
const { connectProducer } = require("./services/kafkaProducer");
const { startCoreService } = require("./services/coreService");
const { initDatabase } = require("./services/database");

const app = express();
const PORT = process.env.PORT || 3001;

const swaggerDoc = YAML.load(path.join(__dirname, "../swagger.yaml"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc, { customSiteTitle: "Facebook Page API Docs" }));

app.use(loggingMiddleware);
app.use(rateLimiter(100, 60000));

app.use("/api/page", pageRouter);
app.use("/webhook", webhookRouter);
app.use("/dashboard", dashboardRouter);

app.get("/", (req, res) => res.redirect("/docs"));

app.use(errorHandler);

async function startServer() {
  await connectProducer();

  try {
    await initDatabase();
  } catch (err) {
    console.warn("[Database] Không thể kết nối PostgreSQL — idempotency sẽ dùng in-memory fallback.");
  }

  await startCoreService();

  app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log(`Swagger UI:        http://localhost:${PORT}/docs`);
    console.log(`Webhook endpoint:  http://localhost:${PORT}/webhook`);
  });
}

startServer();
