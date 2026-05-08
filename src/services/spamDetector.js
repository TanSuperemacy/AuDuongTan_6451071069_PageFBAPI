/**
 * spamDetector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Phát hiện spam từ nội dung bình luận/tin nhắn.
 *
 * Các loại spam được kiểm tra:
 *  1. Chứa liên kết (URL) — spam nhẹ hoặc độc hại tùy theo pattern
 *  2. Lặp nội dung nhiều lần trong 24h — dedup cache
 *  3. Tái phạm nhiều lần — tăng mức độ vi phạm
 *
 * Trả về:
 *  { isSpam: boolean, level: "none"|"mild"|"severe", reason: string }
 */

// ── Cache in-memory ──────────────────────────────────────────────────────────
// contentCache: Map<contentHash, { count, firstSeen, userIds: Set }>
const contentCache = new Map();

// violationCache: Map<userId, { count, firstSeen }>
const violationCache = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ
const REPEAT_THRESHOLD = 3;                 // 3 lần lặp → spam nặng
const VIOLATION_THRESHOLD = 3;             // 3 lần vi phạm → tái phạm

// ── Regex pattern ────────────────────────────────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

// Pattern nhận diện link scam/độc hại phổ biến
const MALICIOUS_PATTERNS = [
  /bit\.ly/i,
  /tinyurl/i,
  /free.*money/i,
  /click.*here.*win/i,
  /casino/i,
  /porn/i,
  /hack/i,
  /phishing/i,
  /t\.me\/[^\s]+/i,   // Telegram spam links
];

/**
 * Tạo hash đơn giản từ nội dung (không cần crypto để nhanh)
 * @param {string} text
 * @returns {string}
 */
function simpleHash(text) {
  // Normalize: lowercase, trim whitespace, remove extra spaces
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 * Dọn cache hết hạn để tránh memory leak
 */
function cleanExpiredCache() {
  const now = Date.now();

  for (const [key, val] of contentCache.entries()) {
    if (now - val.firstSeen > CACHE_TTL_MS) {
      contentCache.delete(key);
    }
  }

  for (const [key, val] of violationCache.entries()) {
    if (now - val.firstSeen > CACHE_TTL_MS) {
      violationCache.delete(key);
    }
  }
}

// Dọn cache mỗi 1 giờ
setInterval(cleanExpiredCache, 60 * 60 * 1000);

/**
 * Ghi nhận một vi phạm của user
 * @param {string} userId
 * @returns {number} Tổng số vi phạm trong 24h
 */
function recordViolation(userId) {
  const now = Date.now();
  const existing = violationCache.get(userId);

  if (!existing || now - existing.firstSeen > CACHE_TTL_MS) {
    violationCache.set(userId, { count: 1, firstSeen: now });
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

/**
 * Lấy số vi phạm hiện tại của user
 * @param {string} userId
 * @returns {number}
 */
function getViolationCount(userId) {
  const existing = violationCache.get(userId);
  if (!existing) return 0;
  if (Date.now() - existing.firstSeen > CACHE_TTL_MS) return 0;
  return existing.count;
}

/**
 * Kiểm tra nội dung có bị lặp không (dedup trong 24h)
 * @param {string} content
 * @param {string} userId
 * @returns {{ isDuplicate: boolean, count: number }}
 */
function checkDuplicate(content, userId) {
  const hash = simpleHash(content);
  const now = Date.now();
  const existing = contentCache.get(hash);

  if (!existing || now - existing.firstSeen > CACHE_TTL_MS) {
    contentCache.set(hash, { count: 1, firstSeen: now, userIds: new Set([userId]) });
    return { isDuplicate: false, count: 1 };
  }

  existing.count += 1;
  existing.userIds.add(userId);
  return { isDuplicate: existing.count >= REPEAT_THRESHOLD, count: existing.count };
}

/**
 * Phát hiện spam từ một normalized event
 *
 * @param {{ senderId: string, content: string }} event
 * @returns {{ isSpam: boolean, level: "none"|"mild"|"severe", reason: string, violationCount: number }}
 */
function detectSpam(event) {
  const { senderId, content } = event;

  if (!content) {
    return { isSpam: false, level: "none", reason: "", violationCount: 0 };
  }

  // ── Kiểm tra link độc hại ──────────────────────────────────────────────────
  const hasMaliciousLink = MALICIOUS_PATTERNS.some((pattern) => pattern.test(content));
  if (hasMaliciousLink) {
    const violationCount = recordViolation(senderId);
    return {
      isSpam: true,
      level: "severe",
      reason: "Chứa liên kết độc hại hoặc scam",
      violationCount,
    };
  }

  // ── Kiểm tra chứa link thông thường ──────────────────────────────────────
  const hasLink = URL_REGEX.test(content);
  URL_REGEX.lastIndex = 0; // Reset regex state

  // ── Kiểm tra lặp nội dung ─────────────────────────────────────────────────
  const { isDuplicate, count } = checkDuplicate(content, senderId);

  if (isDuplicate) {
    const violationCount = recordViolation(senderId);
    return {
      isSpam: true,
      level: violationCount >= VIOLATION_THRESHOLD ? "severe" : "mild",
      reason: `Nội dung bị lặp ${count} lần trong 24h`,
      violationCount,
    };
  }

  if (hasLink) {
    // Link thường — spam nhẹ
    const violationCount = recordViolation(senderId);
    return {
      isSpam: true,
      level: "mild",
      reason: "Chứa liên kết",
      violationCount,
    };
  }

  // ── Kiểm tra tái phạm dù nội dung mới ────────────────────────────────────
  const currentViolations = getViolationCount(senderId);
  if (currentViolations >= VIOLATION_THRESHOLD) {
    return {
      isSpam: false,
      level: "none",
      reason: "",
      violationCount: currentViolations,
      isRepeatOffender: true,
    };
  }

  return { isSpam: false, level: "none", reason: "", violationCount: currentViolations };
}

/**
 * Thêm user vào blacklist nội bộ (chỉ ghi nhận, không auto reply)
 * @param {string} userId
 */
const blacklist = new Set();
function addToBlacklist(userId) {
  blacklist.add(userId);
  console.log(`[SpamDetector] User ${userId} đã bị thêm vào blacklist nội bộ.`);
}

/**
 * Kiểm tra user có trong blacklist không
 * @param {string} userId
 * @returns {boolean}
 */
function isBlacklisted(userId) {
  return blacklist.has(userId);
}

module.exports = { detectSpam, addToBlacklist, isBlacklisted, getViolationCount };
