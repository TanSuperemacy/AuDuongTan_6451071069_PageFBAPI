/**
 * aiService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Phân tích intent (ý định) và sentiment (cảm xúc) của nội dung bình luận
 * bằng Gemini AI API.
 *
 * Kết quả trả về:
 *  {
 *    intent   : "hoi_gia" | "khieu_nai" | "khen" | "spam" | "khong_ro"
 *    sentiment: "tich_cuc" | "tieu_cuc" | "trung_tinh"
 *    confidence: number (0–1)
 *  }
 *
 * Fallback: Nếu GEMINI_API_KEY không được cấu hình, dùng rule-based mock.
 */

const https = require("https");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash"; // Model nhanh, phù hợp cho classification
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const MAX_RETRIES = 2;
const TIMEOUT_MS = 8000;

// ── Prompt template ──────────────────────────────────────────────────────────
function buildPrompt(content) {
  return `Phân tích bình luận Facebook sau và trả về JSON (KHÔNG có markdown, chỉ JSON thuần):

Bình luận: "${content}"

Trả về đúng format này:
{"intent":"<giá trị>","sentiment":"<giá trị>","confidence":<số 0-1>}

Quy tắc:
- intent: một trong [hoi_gia, khieu_nai, khen, spam, khong_ro]
  + hoi_gia: hỏi về giá, sản phẩm, dịch vụ
  + khieu_nai: phàn nàn, chưa nhận hàng, lỗi, hỗ trợ
  + khen: khen ngợi, tích cực, yêu thích
  + spam: quảng cáo, link, lặp lại vô nghĩa
  + khong_ro: không xác định được ý định
- sentiment: một trong [tich_cuc, tieu_cuc, trung_tinh]
- confidence: độ chắc chắn từ 0.0 đến 1.0`;
}

/**
 * Gọi Gemini API với retry
 * @param {string} content
 * @param {number} attempt
 * @returns {Promise<object>}
 */
async function callGeminiAPI(content, attempt = 0) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(content) }] }],
      generationConfig: {
        temperature: 0.1,        // Gần như deterministic
        maxOutputTokens: 100,    // Chỉ cần JSON ngắn
        responseMimeType: "application/json",
      },
    });

    const req = https.request(
      GEMINI_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
            // Làm sạch markdown nếu model vẫn wrap trong ```json
            const cleanText = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
            resolve(JSON.parse(cleanText));
          } catch (err) {
            reject(new Error(`Gemini parse error: ${err.message} | raw: ${data}`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Gemini API timeout"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Mock / Rule-based fallback ───────────────────────────────────────────────
/**
 * Phân tích đơn giản bằng keyword khi không có API key
 * @param {string} content
 * @returns {object}
 */
function mockAnalyze(content) {
  if (!content) {
    return { intent: "khong_ro", sentiment: "trung_tinh", confidence: 0 };
  }

  const lower = content.toLowerCase();

  // Keyword mapping
  const priceKeywords = ["giá", "bao nhiêu", "price", "cost", "mua", "order", "đặt hàng", "ship"];
  const complaintKeywords = ["chưa nhận", "lỗi", "hỏng", "sai", "tệ", "thất vọng", "hoàn tiền", "khiếu nại", "hỗ trợ"];
  const praiseKeywords = ["hay quá", "tuyệt", "đỉnh", "ngon", "thích", "love", "awesome", "great", "chất", "oke", "ok"];
  const spamKeywords = ["http://", "https://", "www.", "click", "miễn phí", "free", "win", "casino"];

  const negativeKeywords = ["tệ", "kém", "thất vọng", "tức", "giận", "không được", "sai", "lỗi", "hỏng"];
  const positiveKeywords = ["tốt", "hay", "đẹp", "tuyệt", "thích", "yêu", "great", "awesome", "chất"];

  let intent = "khong_ro";
  let sentiment = "trung_tinh";
  let confidence = 0.5;

  if (spamKeywords.some((k) => lower.includes(k))) {
    intent = "spam";
    sentiment = "trung_tinh";
    confidence = 0.85;
  } else if (complaintKeywords.some((k) => lower.includes(k))) {
    intent = "khieu_nai";
    sentiment = "tieu_cuc";
    confidence = 0.75;
  } else if (priceKeywords.some((k) => lower.includes(k))) {
    intent = "hoi_gia";
    sentiment = "trung_tinh";
    confidence = 0.7;
  } else if (praiseKeywords.some((k) => lower.includes(k))) {
    intent = "khen";
    sentiment = "tich_cuc";
    confidence = 0.75;
  }

  // Fine-tune sentiment nếu chưa xác định từ intent
  if (sentiment === "trung_tinh") {
    if (negativeKeywords.some((k) => lower.includes(k))) sentiment = "tieu_cuc";
    else if (positiveKeywords.some((k) => lower.includes(k))) sentiment = "tich_cuc";
  }

  return { intent, sentiment, confidence };
}

/**
 * Phân tích intent và sentiment của nội dung.
 * Tự động dùng Gemini API nếu có key, fallback về mock nếu không.
 *
 * @param {string} content - Nội dung bình luận / tin nhắn
 * @returns {Promise<{ intent: string, sentiment: string, confidence: number }>}
 */
async function analyzeContent(content) {
  if (!content) {
    return { intent: "khong_ro", sentiment: "trung_tinh", confidence: 0 };
  }

  // ── Dùng Gemini nếu có API key ────────────────────────────────────────────
  if (GEMINI_API_KEY) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await callGeminiAPI(content, attempt);
        // Validate schema
        if (result.intent && result.sentiment) {
          console.log(
            `[AI] Gemini phân tích: intent=${result.intent}, sentiment=${result.sentiment}, confidence=${result.confidence}`
          );
          return result;
        }
      } catch (err) {
        console.warn(`[AI] Gemini lần ${attempt + 1} thất bại: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          // Chờ trước khi retry (exponential backoff)
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
    console.warn("[AI] Gemini thất bại sau tất cả retry — chuyển sang mock.");
  } else {
    console.log("[AI] Không có GEMINI_API_KEY — dùng rule-based mock.");
  }

  // ── Fallback: mock rule-based ─────────────────────────────────────────────
  const result = mockAnalyze(content);
  console.log(
    `[AI] Mock phân tích: intent=${result.intent}, sentiment=${result.sentiment}, confidence=${result.confidence}`
  );
  return result;
}

module.exports = { analyzeContent };
