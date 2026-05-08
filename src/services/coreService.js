/**
 * coreService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core Service — Kafka Consumer xử lý sự kiện từ topic `raw_events`.
 *
 * Pipeline xử lý mỗi event:
 *  1. Nhận event → trạng thái: received
 *  2. Phát hiện spam (spamDetector)
 *  3. Phân tích intent + sentiment bằng AI (aiService)
 *  4. Ra quyết định tự động (facebookActionService)
 *  5. Cập nhật trạng thái: processed / replied / failed
 *  6. Nếu lỗi → publish `send_failed` để Retry Service xử lý
 *
 * Thiết kế chịu tải:
 *  - Dùng eachBatch để xử lý batch khi traffic đột biến
 *  - Graceful shutdown khi SIGINT/SIGTERM
 */

const { Kafka, logLevel } = require("kafkajs");
const kafkaConfig = require("../config/kafka");
const { detectSpam, addToBlacklist, isBlacklisted } = require("./spamDetector");
const { analyzeContent } = require("./aiService");
const { hideComment, replyToComment } = require("./facebookActionService");

// ── Kafka client & consumer ──────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: `${kafkaConfig.clientId}-consumer`,
  brokers: kafkaConfig.brokers,
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_CONSUMER_GROUP_ID || "core-service",
  // Cấu hình chịu tải: session timeout dài hơn để tránh rebalance khi xử lý chậm
  sessionTimeout: 30000,
  heartbeatInterval: 5000,
});

// Producer riêng để publish `send_failed` và `review_queue`
const failureProducer = kafka.producer();

// ── Tracking trạng thái sự kiện ──────────────────────────────────────────────
/**
 * Map<eventId, { status, updatedAt, details }>
 *
 * Trạng thái:
 *   received  → vừa nhận từ Kafka
 *   processed → đã xử lý xong (spam check + AI)
 *   replied   → đã thực hiện action (ẩn/reply/block)
 *   failed    → xử lý thất bại
 */
const eventStatusMap = new Map();

// Giới hạn kích thước Map để tránh memory leak (giữ 10,000 event gần nhất)
const MAX_STATUS_ENTRIES = 10000;

function updateEventStatus(eventId, status, details = {}) {
  // Giới hạn kích thước map
  if (eventStatusMap.size >= MAX_STATUS_ENTRIES) {
    const firstKey = eventStatusMap.keys().next().value;
    eventStatusMap.delete(firstKey);
  }

  eventStatusMap.set(eventId, {
    status,
    updatedAt: new Date().toISOString(),
    ...details,
  });

  console.log(`[CoreService] Event ${eventId}: trạng thái → ${status}`);
}

/**
 * Lấy trạng thái của một event
 * @param {string} eventId
 * @returns {object|null}
 */
function getEventStatus(eventId) {
  return eventStatusMap.get(eventId) || null;
}

// ── Publish sự kiện thất bại vào topic send_failed ───────────────────────────
async function publishFailure(event, error) {
  try {
    await failureProducer.send({
      topic: "send_failed",
      messages: [
        {
          key: event.pageId || "unknown",
          value: JSON.stringify({
            originalEvent: event,
            error: error.message || String(error),
            failedAt: new Date().toISOString(),
            retryCount: 0,
          }),
        },
      ],
    });
    console.log(`[CoreService] Đã publish event ${event.eventId} vào topic "send_failed".`);
  } catch (err) {
    console.error(`[CoreService] Không thể publish send_failed: ${err.message}`);
  }
}

// ── Publish vào review_queue cho quản trị viên ───────────────────────────────
async function publishToReviewQueue(event, reason) {
  try {
    await failureProducer.send({
      topic: "review_queue",
      messages: [
        {
          key: event.pageId || "unknown",
          value: JSON.stringify({
            event,
            reason,
            queuedAt: new Date().toISOString(),
          }),
        },
      ],
    });
    console.log(`[CoreService] Đã đẩy event ${event.eventId} vào "review_queue" — lý do: ${reason}`);
  } catch (err) {
    console.error(`[CoreService] Không thể publish review_queue: ${err.message}`);
  }
}

// ── Xử lý một event đơn lẻ ──────────────────────────────────────────────────
async function processEvent(event) {
  const { eventId, senderId, content, type, commentId } = event;

  // ── Bước 1: Ghi nhận trạng thái received ──────────────────────────────────
  updateEventStatus(eventId, "received");

  // ── Bước 2: Kiểm tra blacklist ────────────────────────────────────────────
  if (isBlacklisted(senderId)) {
    console.log(`[CoreService] User ${senderId} nằm trong blacklist — bỏ qua, không auto reply.`);
    // Nếu là comment thì vẫn ẩn
    if (type === "comment" && commentId) {
      try {
        await hideComment(commentId);
        updateEventStatus(eventId, "replied", { action: "hidden (blacklisted)" });
      } catch (err) {
        updateEventStatus(eventId, "failed", { error: err.message });
        await publishFailure(event, err);
      }
    } else {
      updateEventStatus(eventId, "processed", { action: "skipped (blacklisted)" });
    }
    return;
  }

  // ── Bước 3: Phát hiện spam ────────────────────────────────────────────────
  const spamResult = detectSpam(event);
  console.log(
    `[CoreService] Spam check — isSpam=${spamResult.isSpam}, level=${spamResult.level}, reason="${spamResult.reason}"`
  );

  // ── Bước 4: Xử lý nếu phát hiện spam ─────────────────────────────────────
  if (spamResult.isSpam) {
    try {
      if (spamResult.level === "severe") {
        // Link độc hại / scam → ẩn ngay + đẩy vào review_queue
        if (type === "comment" && commentId) {
          await hideComment(commentId);
        }
        await publishToReviewQueue(event, spamResult.reason);
        updateEventStatus(eventId, "replied", { action: "hidden + review_queue", spam: spamResult });

        // Nếu vi phạm quá nhiều → blacklist
        if (spamResult.violationCount >= 3) {
          addToBlacklist(senderId);
          console.log(
            `[CoreService] ⚠️ User ${senderId} đã bị blacklist — ${spamResult.violationCount} vi phạm.`
          );
        }
      } else {
        // Spam nhẹ → ẩn comment
        if (type === "comment" && commentId) {
          await hideComment(commentId);
          updateEventStatus(eventId, "replied", { action: "hidden (mild spam)", spam: spamResult });
        } else {
          updateEventStatus(eventId, "processed", { action: "flagged (mild spam)", spam: spamResult });
        }
      }
    } catch (err) {
      console.error(`[CoreService] Lỗi khi xử lý spam eventId=${eventId}: ${err.message}`);
      updateEventStatus(eventId, "failed", { error: err.message, spam: spamResult });
      await publishFailure(event, err);
    }
    return;
  }

  // ── Bước 5: Phân tích AI (intent + sentiment) ────────────────────────────
  let aiResult = { intent: "khong_ro", sentiment: "trung_tinh", confidence: 0 };
  try {
    aiResult = await analyzeContent(content);
  } catch (err) {
    console.warn(`[CoreService] AI analysis thất bại: ${err.message} — tiếp tục với default.`);
  }

  updateEventStatus(eventId, "processed", { ai: aiResult });

  // ── Bước 6: Ra quyết định dựa trên AI ────────────────────────────────────
  try {
    // Chỉ auto reply cho comment (không reply message trong demo)
    if (type === "comment" && commentId) {
      let replyMessage = null;

      switch (aiResult.intent) {
        case "hoi_gia":
          replyMessage =
            "Cảm ơn bạn đã quan tâm! Vui lòng inbox cho Page để được tư vấn chi tiết về giá và sản phẩm nhé. 😊";
          break;
        case "khieu_nai":
          replyMessage =
            "Xin lỗi bạn vì trải nghiệm chưa tốt. Vui lòng inbox Page kèm mã đơn hàng, đội ngũ sẽ hỗ trợ sớm nhất. 🙏";
          break;
        case "khen":
          replyMessage =
            "Cảm ơn bạn rất nhiều! Feedback của bạn là động lực lớn cho đội ngũ chúng mình. ❤️";
          break;
        // "spam", "khong_ro" → không auto reply
        default:
          break;
      }

      if (replyMessage && !isBlacklisted(senderId)) {
        await replyToComment(commentId, replyMessage);
        updateEventStatus(eventId, "replied", { ai: aiResult, action: `auto-reply (${aiResult.intent})` });
      } else {
        updateEventStatus(eventId, "processed", { ai: aiResult, action: "no action needed" });
      }
    } else {
      updateEventStatus(eventId, "processed", { ai: aiResult, action: "message — logged only" });
    }
  } catch (err) {
    console.error(`[CoreService] Lỗi khi thực hiện action eventId=${eventId}: ${err.message}`);
    updateEventStatus(eventId, "failed", { error: err.message, ai: aiResult });
    await publishFailure(event, err);
  }
}

// ── Khởi động Consumer ──────────────────────────────────────────────────────
let isRunning = false;

async function startCoreService() {
  if (isRunning) return;

  try {
    // Kết nối failure producer trước
    await failureProducer.connect();
    console.log("[CoreService] Failure producer đã kết nối.");

    // Kết nối consumer
    await consumer.connect();
    console.log("[CoreService] Consumer đã kết nối.");

    await consumer.subscribe({
      topic: kafkaConfig.topic, // raw_events
      fromBeginning: false,     // Chỉ nhận event mới, không đọc lại event cũ
    });

    // ── Dùng eachBatch để chịu tải đột biến ────────────────────────────────
    await consumer.run({
      // Tự động commit offset khi batch xử lý xong
      autoCommit: true,
      autoCommitInterval: 5000,

      eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning: batchIsRunning, isStale }) => {
        const { topic, partition, messages } = batch;
        console.log(
          `[CoreService] Nhận batch: ${messages.length} message(s) từ ${topic}[${partition}]`
        );

        for (const message of messages) {
          // Kiểm tra consumer vẫn đang chạy
          if (!batchIsRunning() || isStale()) break;

          try {
            const event = JSON.parse(message.value.toString());
            await processEvent(event);
          } catch (err) {
            console.error(
              `[CoreService] Lỗi xử lý message offset=${message.offset}: ${err.message}`
            );
          }

          // Đánh dấu offset đã xử lý
          resolveOffset(message.offset);
          // Gửi heartbeat để tránh bị Kafka kick vì xử lý quá lâu
          await heartbeat();
        }
      },
    });

    isRunning = true;
    console.log("[CoreService] ✅ Core Service đang chạy — lắng nghe topic:", kafkaConfig.topic);
  } catch (err) {
    console.error("[CoreService] Không thể khởi động:", err.message);
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function stopCoreService() {
  if (!isRunning) return;
  console.log("[CoreService] Đang dừng...");
  await consumer.disconnect();
  await failureProducer.disconnect();
  isRunning = false;
  console.log("[CoreService] Đã dừng.");
}

process.on("SIGINT", async () => {
  await stopCoreService();
});
process.on("SIGTERM", async () => {
  await stopCoreService();
});

module.exports = { startCoreService, stopCoreService, getEventStatus };
