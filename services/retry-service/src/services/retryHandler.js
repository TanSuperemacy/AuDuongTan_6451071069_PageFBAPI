const { Kafka, logLevel } = require("kafkajs");
const config = require("../config");

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers,
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({ groupId: "retry-service" });
const producer = kafka.producer();

function calculateDelay(attempt) {
  return config.baseDelayMs * Math.pow(2, attempt);
}

async function processFailedMessage(message) {
  const { originalEvent, error, failedAt, retryCount = 0 } = JSON.parse(message.value.toString());

  console.log(`[RetryService] Event ${originalEvent?.eventId || "?"}: lần thử ${retryCount + 1}/${config.maxRetries}`);

  if (retryCount >= config.maxRetries) {
    console.log(`[RetryService] ❌ Đã hết lượt thử — gửi vào dead_letter`);
    await producer.send({
      topic: "dead_letter",
      messages: [{
        key: message.key,
        value: JSON.stringify({
          originalEvent,
          error,
          failedAt,
          retryCount,
          deadAt: new Date().toISOString(),
        }),
      }],
    });
    return;
  }

  const delay = calculateDelay(retryCount);
  console.log(`[RetryService] ⏳ Chờ ${delay}ms trước khi retry lần ${retryCount + 1}...`);

  await new Promise((resolve) => setTimeout(resolve, delay));

  await producer.send({
    topic: "send_retry",
    messages: [{
      key: message.key,
      value: JSON.stringify({
        originalEvent,
        retryCount: retryCount + 1,
        lastError: error,
        nextRetryAt: new Date(Date.now() + calculateDelay(retryCount + 1)).toISOString(),
      }),
    }],
  });

  console.log(`[RetryService] ✅ Đã publish send_retry cho event ${originalEvent?.eventId || "?"}`);
}

async function startRetryService() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: "send_failed", fromBeginning: false });

  console.log(`[RetryService] Đang lắng nghe topic "send_failed" — tối đa ${config.maxRetries} lần retry`);

  await consumer.run({
    autoCommit: true,
    autoCommitInterval: 5000,
    eachMessage: async ({ message }) => {
      try {
        await processFailedMessage(message);
      } catch (err) {
        console.error(`[RetryService] Lỗi xử lý: ${err.message}`);
      }
    },
  });
}

async function stopRetryService() {
  await consumer.disconnect();
  await producer.disconnect();
  console.log("[RetryService] Đã dừng.");
}

process.on("SIGINT", stopRetryService);
process.on("SIGTERM", stopRetryService);

module.exports = { startRetryService, stopRetryService };
