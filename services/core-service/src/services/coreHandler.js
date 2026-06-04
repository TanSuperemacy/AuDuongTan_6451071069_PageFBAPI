const { Kafka, logLevel } = require("kafkajs");
const config = require("../config");
const { detectSpam, addToBlacklist, isBlacklisted } = require("./spamDetector");
const { analyzeContent } = require("./aiService");

const kafka = new Kafka({ clientId: `${config.kafkaClientId}-consumer`, brokers: config.kafkaBrokers, logLevel: logLevel.WARN });

const consumer = kafka.consumer({ groupId: config.kafkaConsumerGroup, sessionTimeout: 30000, heartbeatInterval: 5000 });
const producer = kafka.producer();

const eventStatusMap = new Map();
const MAX_STATUS_ENTRIES = 10000;

function updateEventStatus(eventId, status, details = {}) {
  if (eventStatusMap.size >= MAX_STATUS_ENTRIES) { const firstKey = eventStatusMap.keys().next().value; eventStatusMap.delete(firstKey); }
  eventStatusMap.set(eventId, { status, updatedAt: new Date().toISOString(), ...details });
  console.log(`[CoreService] Event ${eventId}: ${status}`);
}

async function publishToTopic(topic, event, extra = {}) {
  try {
    await producer.send({ topic, messages: [{ key: event.pageId || "unknown", value: JSON.stringify({ originalEvent: event, ...extra, failedAt: new Date().toISOString() }) }] });
    console.log(`[CoreService] Đã publish vào "${topic}" eventId=${event.eventId}`);
  } catch (err) {
    console.error(`[CoreService] Lỗi publish ${topic}: ${err.message}`);
  }
}

async function processEvent(event) {
  const { eventId, senderId, content, type, commentId } = event;

  updateEventStatus(eventId, "received");

  if (isBlacklisted(senderId)) {
    console.log(`[CoreService] User ${senderId} trong blacklist — bỏ qua.`);
    updateEventStatus(eventId, "processed", { action: "skipped (blacklisted)" });
    return;
  }

  const spamResult = detectSpam(event);
  console.log(`[CoreService] Spam: isSpam=${spamResult.isSpam}, level=${spamResult.level}`);

  if (spamResult.isSpam) {
    try {
      if (spamResult.level === "severe") {
        await publishToTopic("review_queue", event, { reason: spamResult.reason });
        updateEventStatus(eventId, "replied", { action: "review_queue", spam: spamResult });
        if (spamResult.violationCount >= 3) { addToBlacklist(senderId); }
      } else {
        updateEventStatus(eventId, "replied", { action: "flagged (mild spam)", spam: spamResult });
      }
    } catch (err) {
      updateEventStatus(eventId, "failed", { error: err.message });
      await publishToTopic("send_failed", event, { error: err.message, retryCount: 0 });
    }
    return;
  }

  let aiResult = { intent: "khong_ro", sentiment: "trung_tinh", confidence: 0 };
  try { aiResult = await analyzeContent(content); } catch (err) { console.warn(`[CoreService] AI lỗi: ${err.message}`); }

  updateEventStatus(eventId, "processed", { ai: aiResult });

  try {
    let replyMessage = null;
    switch (aiResult.intent) {
      case "hoi_gia": replyMessage = "Cảm ơn bạn đã quan tâm! Vui lòng inbox để được tư vấn chi tiết."; break;
      case "khieu_nai": replyMessage = "Xin lỗi bạn vì trải nghiệm chưa tốt. Vui lòng inbox kèm mã đơn hàng để được hỗ trợ."; break;
      case "khen": replyMessage = "Cảm ơn bạn rất nhiều! Feedback của bạn là động lực lớn cho chúng mình."; break;
    }

    if (replyMessage) {
      await publishToTopic("reply_commands", event, { replyMessage, aiResult });
      updateEventStatus(eventId, "replied", { action: `auto-reply (${aiResult.intent})` });
    } else {
      updateEventStatus(eventId, "processed", { action: "no action needed" });
    }
  } catch (err) {
    updateEventStatus(eventId, "failed", { error: err.message });
    await publishToTopic("send_failed", event, { error: err.message, retryCount: 0 });
  }
}

async function startCoreService() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopic, fromBeginning: false });

  console.log(`[CoreService] Đang lắng nghe topic "${config.kafkaTopic}"...`);

  await consumer.run({
    autoCommit: true,
    autoCommitInterval: 5000,
    eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
      console.log(`[CoreService] Batch: ${batch.messages.length} messages`);
      for (const message of batch.messages) {
        if (!isRunning() || isStale()) break;
        try {
          const event = JSON.parse(message.value.toString());
          await processEvent(event);
        } catch (err) { console.error(`[CoreService] Lỗi offset=${message.offset}: ${err.message}`); }
        resolveOffset(message.offset);
        await heartbeat();
      }
    },
  });
}

async function stop() { await consumer.disconnect(); await producer.disconnect(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

module.exports = { startCoreService };
