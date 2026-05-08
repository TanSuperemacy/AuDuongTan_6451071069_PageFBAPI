/**
 * kafkaProducer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service quản lý Kafka Producer.
 *
 * Chức năng:
 *  - Kết nối đến Kafka broker khi server khởi động.
 *  - Cung cấp hàm `publishEvent(event)` để đẩy một sự kiện đã chuẩn hóa
 *    vào topic `raw_events`.
 *  - Tự động ngắt kết nối khi tiến trình Node.js bị tắt (SIGINT/SIGTERM).
 */

const { Kafka, logLevel } = require("kafkajs");
const kafkaConfig = require("../config/kafka");

// ── Khởi tạo Kafka client ────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: kafkaConfig.clientId,
  brokers: kafkaConfig.brokers,
  // Chỉ hiện log từ mức WARN trở lên để không spam console
  logLevel: logLevel.WARN,
});

const producer = kafka.producer();
let isConnected = false;

/**
 * Kết nối Kafka Producer.
 * Gọi một lần khi server khởi động (trong index.js).
 */
async function connectProducer() {
  if (isConnected) return;
  try {
    await producer.connect();
    isConnected = true;
    console.log(`[Kafka] Producer đã kết nối. Topic: "${kafkaConfig.topic}"`);
  } catch (err) {
    console.error("[Kafka] Không thể kết nối Producer:", err.message);
    // Không throw — để server vẫn chạy dù Kafka chưa sẵn sàng
  }
}

/**
 * Đẩy một sự kiện đã chuẩn hóa vào Kafka topic `raw_events`.
 *
 * @param {object} normalizedEvent - Sự kiện đã đi qua normalizeEvent()
 * @returns {Promise<void>}
 */
async function publishEvent(normalizedEvent) {
  if (!isConnected) {
    console.warn("[Kafka] Producer chưa kết nối — bỏ qua sự kiện:", normalizedEvent.eventId);
    return;
  }

  const message = {
    // key = pageId giúp Kafka phân vùng theo trang
    key: normalizedEvent.pageId || "unknown",
    value: JSON.stringify(normalizedEvent),
  };

  await producer.send({
    topic: kafkaConfig.topic,
    messages: [message],
  });

  console.log(
    `[Kafka] Đã publish event [${normalizedEvent.type}] eventId=${normalizedEvent.eventId} → topic="${kafkaConfig.topic}"`
  );
}

/**
 * Ngắt kết nối Kafka Producer một cách an toàn.
 * Tự động được gọi khi process nhận signal SIGINT/SIGTERM.
 */
async function disconnectProducer() {
  if (!isConnected) return;
  await producer.disconnect();
  isConnected = false;
  console.log("[Kafka] Producer đã ngắt kết nối.");
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGINT", async () => {
  await disconnectProducer();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await disconnectProducer();
  process.exit(0);
});

module.exports = { connectProducer, publishEvent, disconnectProducer };
