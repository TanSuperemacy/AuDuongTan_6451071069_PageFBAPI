const rateLimit = {};

function rateLimiter(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();

    if (!rateLimit[ip]) {
      rateLimit[ip] = { count: 0, resetAt: now + windowMs };
    }

    const entry = rateLimit[ip];

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: { message: "Quá nhiều request — vui lòng thử lại sau." },
      });
    }

    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of Object.entries(rateLimit)) {
    if (now > entry.resetAt) delete rateLimit[ip];
  }
}, 60000);

module.exports = rateLimiter;
