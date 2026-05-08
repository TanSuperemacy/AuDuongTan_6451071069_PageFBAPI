/**
 * normalizeEvent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Chuẩn hóa (Normalize) payload thô từ Facebook Webhook thành một
 * Schema JSON thống nhất, dù đó là sự kiện Comment hay Message.
 *
 * ┌──────────────────────────── UNIFIED SCHEMA ────────────────────────────┐
 * │  {                                                                      │
 * │    eventId    : string   — ID duy nhất của sự kiện (UUID v4)           │
 * │    type       : string   — "comment" | "message" | "unknown"           │
 * │    pageId     : string   — ID của Facebook Page nhận sự kiện           │
 * │    senderId   : string   — ID người gửi                                │
 * │    recipientId: string   — ID người nhận (page hoặc post)              │
 * │    content    : string   — Nội dung tin nhắn / bình luận               │
 * │    attachments: Array    — Danh sách file đính kèm (nếu có)            │
 * │    postId     : string|null — Post liên quan (chỉ có ở comment)        │
 * │    commentId  : string|null — ID comment (chỉ có ở comment)            │
 * │    timestamp  : string   — Thời điểm sự kiện xảy ra (ISO 8601)        │
 * │    receivedAt : string   — Thời điểm server nhận được (ISO 8601)       │
 * │    raw        : object   — Payload gốc từ Facebook (để debug)          │
 * │  }                                                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

const { randomUUID } = require("crypto");

/**
 * Chuẩn hóa một entry trong mảng `entry` từ Facebook Webhook payload.
 *
 * @param {string} pageId   - ID của page (lấy từ entry.id)
 * @param {object} rawEntry - Một phần tử trong entry[].messaging[] hoặc entry[].changes[]
 * @param {"message"|"comment"|"unknown"} type
 * @returns {object} Normalized event
 */
function buildNormalizedEvent(pageId, rawEntry, type) {
  const now = new Date().toISOString();

  // ── Trường hợp: Tin nhắn riêng (Messenger) ──────────────────────────────
  if (type === "message") {
    const msg = rawEntry.message || {};
    return {
      eventId: randomUUID(),
      type: "message",
      pageId,
      senderId: rawEntry.sender?.id || null,
      recipientId: rawEntry.recipient?.id || null,
      content: msg.text || null,
      attachments: msg.attachments || [],
      postId: null,
      commentId: null,
      timestamp: rawEntry.timestamp
        ? new Date(rawEntry.timestamp * 1000).toISOString()
        : now,
      receivedAt: now,
      raw: rawEntry,
    };
  }

  // ── Trường hợp: Bình luận bài đăng (Feed comment) ───────────────────────
  if (type === "comment") {
    const value = rawEntry.value || {};
    return {
      eventId: randomUUID(),
      type: "comment",
      pageId,
      senderId: value.from?.id || null,
      recipientId: pageId,
      content: value.message || null,
      attachments: [],
      postId: value.post_id || null,
      commentId: value.comment_id || null,
      timestamp: value.created_time
        ? new Date(value.created_time * 1000).toISOString()
        : now,
      receivedAt: now,
      raw: rawEntry,
    };
  }

  // ── Trường hợp không xác định ────────────────────────────────────────────
  return {
    eventId: randomUUID(),
    type: "unknown",
    pageId,
    senderId: null,
    recipientId: null,
    content: null,
    attachments: [],
    postId: null,
    commentId: null,
    timestamp: now,
    receivedAt: now,
    raw: rawEntry,
  };
}

/**
 * Phân tích và chuẩn hóa toàn bộ Facebook Webhook body.
 *
 * Facebook có thể gửi nhiều `entry` trong một request,
 * mỗi entry có thể chứa nhiều sự kiện con.
 *
 * @param {object} body - req.body từ Facebook Webhook
 * @returns {Array<object>} Danh sách các normalized events
 */
function normalizeWebhookPayload(body) {
  const normalizedEvents = [];

  if (!body || !Array.isArray(body.entry)) return normalizedEvents;

  for (const entry of body.entry) {
    const pageId = entry.id || "unknown";

    // ── Sự kiện Messenger (tin nhắn) ──────────────────────────────────────
    if (Array.isArray(entry.messaging)) {
      for (const msgEvent of entry.messaging) {
        if (msgEvent.message) {
          normalizedEvents.push(buildNormalizedEvent(pageId, msgEvent, "message"));
        }
      }
    }

    // ── Sự kiện Feed (comment, reaction, ...) ─────────────────────────────
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === "feed" && change.value?.item === "comment") {
          normalizedEvents.push(buildNormalizedEvent(pageId, change, "comment"));
        }
      }
    }
  }

  return normalizedEvents;
}

module.exports = { normalizeWebhookPayload };
