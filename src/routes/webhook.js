/**
 * webhook.js — Route xử lý Facebook Webhook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Hai endpoint:
 *  GET  /webhook  → Xác thực (Verification) lần đầu đăng ký Webhook với Facebook
 *  POST /webhook  → Nhận sự kiện thực tế, xác thực chữ ký, chuẩn hóa, publish Kafka
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { normalizeWebhookPayload } = require("../utils/normalizeEvent");
const { publishEvent } = require("../services/kafkaProducer");

// ── Hằng số ──────────────────────────────────────────────────────────────────
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "my_verify_token";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

// ── Hàm xác thực chữ ký X-Hub-Signature-256 ──────────────────────────────────
/**
 * Facebook ký payload bằng HMAC-SHA256 với App Secret.
 * Ta phải so sánh chữ ký nhận được với chữ ký tự tính để tránh giả mạo.
 *
 * @param {Buffer} rawBody  - Buffer của request body (chưa parse)
 * @param {string} signature - Giá trị header X-Hub-Signature-256
 * @returns {boolean}
 */
function verifySignature(rawBody, signature) {
  // Nếu chưa cấu hình APP_SECRET → bỏ qua xác thực (chỉ trong môi trường dev)
  if (!APP_SECRET) {
    console.warn("[Webhook] FACEBOOK_APP_SECRET chưa được cấu hình — bỏ qua xác thực chữ ký.");
    return true;
  }

  if (!signature) return false;

  // Facebook gửi header dạng: "sha256=<hex_digest>"
  const [algo, receivedHash] = signature.split("=");
  if (algo !== "sha256") return false;

  const expectedHash = crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody)
    .digest("hex");

  // Dùng timingSafeEqual để tránh timing attack
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHash, "hex"),
      Buffer.from(expectedHash, "hex")
    );
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /webhook — Xác thực Webhook lần đầu (Challenge-Response)
// ────────────────────────────────────────────────────────────────────────────
/**
 * Khi bạn nhấn "Verify and Save" trên Meta Developer Dashboard,
 * Facebook sẽ gửi GET request với 3 query params:
 *   hub.mode         = "subscribe"
 *   hub.verify_token = <token bạn điền>
 *   hub.challenge    = <chuỗi ngẫu nhiên>
 *
 * Server phải trả về đúng hub.challenge nếu token khớp.
 */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Webhook] Xác thực thành công — Trả về challenge.");
    return res.status(200).send(challenge);
  }

  console.warn("[Webhook] Xác thực thất bại — Token không khớp.");
  return res.status(403).json({ error: "Forbidden: verify token không hợp lệ." });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /webhook — Nhận sự kiện từ Facebook
// ────────────────────────────────────────────────────────────────────────────
/**
 * Quy trình xử lý:
 *  1. Đọc raw body (Buffer) để xác thực chữ ký.
 *  2. Kiểm tra header X-Hub-Signature-256.
 *  3. Parse JSON.
 *  4. Chuẩn hóa payload → normalized events.
 *  5. Publish từng event vào Kafka topic "raw_events".
 *  6. Luôn trả về 200 OK ngay lập tức (Facebook yêu cầu phải phản hồi < 20s).
 */
router.post(
  "/",
  // Middleware: đọc raw body dưới dạng Buffer trước khi express.json() parse
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // ── Bước 1: Luôn trả về 200 ngay để Facebook không retry ────────────────
    res.status(200).json({ status: "EVENT_RECEIVED" });

    // ── Bước 2: Xác thực chữ ký X-Hub-Signature-256 ─────────────────────────
    const signature = req.headers["x-hub-signature-256"];
    const rawBody = req.body; // Buffer nhờ express.raw()

    if (!verifySignature(rawBody, signature)) {
      console.error("[Webhook] Chữ ký không hợp lệ — Bỏ qua payload.");
      return; // Đã trả 200 rồi — chỉ cần không xử lý tiếp
    }

    // ── Bước 3: Parse JSON ────────────────────────────────────────────────────
    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      console.error("[Webhook] Không thể parse JSON:", err.message);
      return;
    }

    // ── Bước 4: Chuẩn hóa dữ liệu ────────────────────────────────────────────
    const normalizedEvents = normalizeWebhookPayload(payload);
    console.log(`[Webhook] Nhận ${normalizedEvents.length} sự kiện từ Facebook.`);

    // ── Bước 5: Publish từng sự kiện vào Kafka ────────────────────────────────
    for (const event of normalizedEvents) {
      try {
        await publishEvent(event);
      } catch (err) {
        console.error(`[Webhook] Lỗi khi publish eventId=${event.eventId}:`, err.message);
      }
    }
  }
);

module.exports = router;
