function loggingMiddleware(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${method} ${originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}

module.exports = loggingMiddleware;
