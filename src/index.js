require("dotenv").config();
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const pageRouter = require("./routes/page");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/page", pageRouter);

// Redirect trang chủ vào Swagger docs
app.get("/", (req, res) => {
  res.redirect("/docs");
});

// ── Error handler (phải đặt cuối cùng) ───────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  console.log(`Swagger UI:        http://localhost:${PORT}/docs`);
});
