const express = require("express");
const router = express.Router();
const dashboardAuth = require("../middleware/auth");
const { getEventStatus } = require("../services/coreService");
const { getCircuitBreakerState } = require("../services/facebookActionService");
const { getViolationCount } = require("../services/spamDetector");

router.use(dashboardAuth);

router.get("/status", (req, res) => {
  res.json({
    success: true,
    data: {
      service: "webhook-service",
      port: process.env.PORT || 3001,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

router.get("/circuit-breaker", (req, res) => {
  res.json({ success: true, data: getCircuitBreakerState() });
});

router.get("/events/:eventId", (req, res) => {
  const status = getEventStatus(req.params.eventId);
  if (!status) return res.status(404).json({ success: false, error: { message: "Event không tồn tại." } });
  res.json({ success: true, data: status });
});

module.exports = router;
