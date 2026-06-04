const { Kafka, logLevel } = require("kafkajs");
const config = require("../config");
const { replyToComment, hideComment } = require("./graphClient");
const { isCommandProcessed, markCommandProcessed } = require("./idempotency");

const kafka = new Kafka({ clientId: "backend-api-consumer", brokers: config.kafkaBrokers, logLevel: logLevel.WARN });
const consumer = kafka.consumer({ groupId: "backend-api" });
const failureProducer = kafka.producer();

async function processReplyCommand(message) {
  const { originalEvent, replyMessage, aiResult, retryCount } = JSON.parse(message.value.toString());
  const commandId = originalEvent?.eventId || `cmd_${Date.now()}`;

  const alreadyProcessed = await isCommandProcessed(commandId);
  if (alreadyProcessed) {
    console.log(`[BackendAPI] Idempotent: bỏ qua command ${commandId} (đã xử lý)`);
    return;
  }

  await markCommandProcessed(commandId, "processing");

  try {
    if (originalEvent.type === "comment" && originalEvent.commentId) {
      if (aiResult?.intent === "spam" || originalEvent.hide) {
        await hideComment(originalEvent.commentId);
      } else if (replyMessage) {
        await replyToComment(originalEvent.commentId, replyMessage);
      }
    }
    await markCommandProcessed(commandId, "completed");
    console.log(`[BackendAPI] ✅ Đã xử lý command ${commandId}`);
  } catch (err) {
    console.error(`[BackendAPI] Lỗi xử lý command ${commandId}: ${err.message}`);
    await failureProducer.send({
      topic: "send_failed",
      messages: [{ key: commandId, value: JSON.stringify({ originalEvent, error: err.message, retryCount: retryCount || 0, failedAt: new Date().toISOString() }) }],
    });
  }
}

async function startConsumer() {
  await failureProducer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: "reply_commands", fromBeginning: false });
  await consumer.subscribe({ topic: "send_retry", fromBeginning: false });

  console.log("[BackendAPI] Consumer đang lắng nghe topics: reply_commands, send_retry");

  await consumer.run({
    autoCommit: true,
    autoCommitInterval: 5000,
    eachMessage: async ({ topic, message }) => {
      if (topic === "reply_commands" || topic === "send_retry") {
        await processReplyCommand(message);
      }
    },
  });
}

module.exports = { startConsumer };
