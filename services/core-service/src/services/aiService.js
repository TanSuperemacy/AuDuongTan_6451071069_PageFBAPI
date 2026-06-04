const https = require("https");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 8000;

function buildPrompt(content) {
  return `Phân tích bình luận Facebook sau và trả về JSON (KHÔNG có markdown, chỉ JSON thuần):

Bình luận: "${content}"

Trả về đúng format này:
{"intent":"<giá trị>","sentiment":"<giá trị>","confidence":<số 0-1>}

Quy tắc:
- intent: một trong [hoi_gia, khieu_nai, khen, spam, khong_ro]
- sentiment: một trong [tich_cuc, tieu_cuc, trung_tinh]
- confidence: độ chắc chắn từ 0.0 đến 1.0`;
}

function callGeminiAPI(content) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(content) }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 100, responseMimeType: "application/json" },
    });

    const req = https.request(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
          const cleanText = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          resolve(JSON.parse(cleanText));
        } catch (err) {
          reject(new Error(`Gemini parse error: ${err.message}`));
        }
      });
    });

    req.on("timeout", () => { req.destroy(); reject(new Error("Gemini API timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function mockAnalyze(content) {
  if (!content) return { intent: "khong_ro", sentiment: "trung_tinh", confidence: 0 };
  const lower = content.toLowerCase();

  const priceKeywords = ["giá", "bao nhiêu", "price", "cost", "mua", "order", "đặt hàng", "ship"];
  const complaintKeywords = ["chưa nhận", "lỗi", "hỏng", "sai", "tệ", "thất vọng", "hoàn tiền", "khiếu nại", "hỗ trợ"];
  const praiseKeywords = ["hay quá", "tuyệt", "đỉnh", "ngon", "thích", "love", "awesome", "great", "chất"];
  const spamKeywords = ["http://", "https://", "www.", "click", "miễn phí", "free", "win", "casino"];
  const negativeKeywords = ["tệ", "kém", "thất vọng", "tức", "giận", "không được", "sai", "lỗi", "hỏng"];
  const positiveKeywords = ["tốt", "hay", "đẹp", "tuyệt", "thích", "yêu", "great", "awesome", "chất"];

  let intent = "khong_ro", sentiment = "trung_tinh", confidence = 0.5;

  if (spamKeywords.some((k) => lower.includes(k))) { intent = "spam"; confidence = 0.85; }
  else if (complaintKeywords.some((k) => lower.includes(k))) { intent = "khieu_nai"; sentiment = "tieu_cuc"; confidence = 0.75; }
  else if (priceKeywords.some((k) => lower.includes(k))) { intent = "hoi_gia"; confidence = 0.7; }
  else if (praiseKeywords.some((k) => lower.includes(k))) { intent = "khen"; sentiment = "tich_cuc"; confidence = 0.75; }

  if (sentiment === "trung_tinh") {
    if (negativeKeywords.some((k) => lower.includes(k))) sentiment = "tieu_cuc";
    else if (positiveKeywords.some((k) => lower.includes(k))) sentiment = "tich_cuc";
  }

  return { intent, sentiment, confidence };
}

async function analyzeContent(content) {
  if (!content) return { intent: "khong_ro", sentiment: "trung_tinh", confidence: 0 };

  if (GEMINI_API_KEY) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await callGeminiAPI(content);
        if (result.intent && result.sentiment) {
          console.log(`[AI] Gemini: intent=${result.intent}, sentiment=${result.sentiment}, confidence=${result.confidence}`);
          return result;
        }
      } catch (err) {
        console.warn(`[AI] Gemini lần ${attempt + 1} thất bại: ${err.message}`);
        if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
    console.warn("[AI] Gemini thất bại — chuyển sang mock.");
  }

  const result = mockAnalyze(content);
  console.log(`[AI] Mock: intent=${result.intent}, sentiment=${result.sentiment}, confidence=${result.confidence}`);
  return result;
}

module.exports = { analyzeContent };
