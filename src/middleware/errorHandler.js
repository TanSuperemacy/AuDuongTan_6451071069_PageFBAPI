/**
 * Middleware xử lý lỗi tập trung.
 * Bắt lỗi từ axios (gọi Graph API) và lỗi nội bộ.
 */
function errorHandler(err, req, res, next) {
  // Lỗi trả về từ Graph API
  if (err.response) {
    const { status, data } = err.response;
    return res.status(status).json({
      success: false,
      error: data.error || data,
    });
  }

  // Lỗi nội bộ hoặc không có kết nối
  console.error("[Error]", err.message);
  res.status(500).json({
    success: false,
    error: { message: err.message || "Internal Server Error" },
  });
}

module.exports = errorHandler;
