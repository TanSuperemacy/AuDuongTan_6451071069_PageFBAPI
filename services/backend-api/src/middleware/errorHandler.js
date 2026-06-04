function errorHandler(err, req, res, next) {
  if (err.response) {
    const { status, data } = err.response;
    return res.status(status).json({ success: false, error: data.error || data });
  }
  console.error("[Error]", err.message);
  res.status(500).json({ success: false, error: { message: err.message || "Internal Server Error" } });
}

module.exports = errorHandler;
