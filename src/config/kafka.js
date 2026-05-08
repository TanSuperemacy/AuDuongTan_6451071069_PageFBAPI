/**
 * Cấu hình kết nối Kafka.
 * Đọc từ biến môi trường trong file .env.
 */
module.exports = {
  // Địa chỉ Kafka broker (có thể thêm nhiều broker phân cách bởi dấu phẩy)
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),

  // Client ID để Kafka nhận biết ứng dụng này
  clientId: process.env.KAFKA_CLIENT_ID || "facebook-page-api",

  // Tên topic mà Webhook Producer sẽ đẩy sự kiện vào
  topic: process.env.KAFKA_TOPIC || "raw_events",
};
