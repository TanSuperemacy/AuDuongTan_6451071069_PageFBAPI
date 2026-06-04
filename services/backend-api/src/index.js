require("dotenv").config({ path: "../../../.env" });
const express = require("express");
const apiRouter = require("./routes/api");
const errorHandler = require("./middleware/errorHandler");
const { startConsumer } = require("./services/consumerHandler");
const config = require("./config");

const app = express();
app.use(express.json());
app.use("/api/page", apiRouter);
app.use(errorHandler);

async function start() {
  await startConsumer();
  app.listen(config.port, () => {
    console.log(`[BackendAPI] Đang chạy tại http://localhost:${config.port}`);
    console.log(`[BackendAPI] Service duy nhất gọi Facebook Graph API`);
  });
}

start().catch(console.error);
