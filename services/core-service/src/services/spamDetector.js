const contentCache = new Map();
const violationCache = new Map();
const blacklist = new Set();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REPEAT_THRESHOLD = 3;
const VIOLATION_THRESHOLD = 3;
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
const MALICIOUS_PATTERNS = [/bit\.ly/i, /tinyurl/i, /free.*money/i, /click.*here.*win/i, /casino/i, /porn/i, /hack/i, /phishing/i, /t\.me\/[^\s]+/i];

function simpleHash(text) {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) { hash = (hash << 5) - hash + normalized.charCodeAt(i); hash |= 0; }
  return hash.toString();
}

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, val] of contentCache.entries()) { if (now - val.firstSeen > CACHE_TTL_MS) contentCache.delete(key); }
  for (const [key, val] of violationCache.entries()) { if (now - val.firstSeen > CACHE_TTL_MS) violationCache.delete(key); }
}

setInterval(cleanExpiredCache, 60 * 60 * 1000);

function recordViolation(userId) {
  const now = Date.now();
  const existing = violationCache.get(userId);
  if (!existing || now - existing.firstSeen > CACHE_TTL_MS) { violationCache.set(userId, { count: 1, firstSeen: now }); return 1; }
  existing.count += 1;
  return existing.count;
}

function getViolationCount(userId) {
  const existing = violationCache.get(userId);
  if (!existing || Date.now() - existing.firstSeen > CACHE_TTL_MS) return 0;
  return existing.count;
}

function checkDuplicate(content, userId) {
  const hash = simpleHash(content);
  const now = Date.now();
  const existing = contentCache.get(hash);
  if (!existing || now - existing.firstSeen > CACHE_TTL_MS) { contentCache.set(hash, { count: 1, firstSeen: now, userIds: new Set([userId]) }); return { isDuplicate: false, count: 1 }; }
  existing.count += 1;
  existing.userIds.add(userId);
  return { isDuplicate: existing.count >= REPEAT_THRESHOLD, count: existing.count };
}

function detectSpam(event) {
  const { senderId, content } = event;
  if (!content) return { isSpam: false, level: "none", reason: "", violationCount: 0 };

  if (MALICIOUS_PATTERNS.some((p) => p.test(content))) {
    return { isSpam: true, level: "severe", reason: "Chứa liên kết độc hại", violationCount: recordViolation(senderId) };
  }

  const hasLink = URL_REGEX.test(content);
  URL_REGEX.lastIndex = 0;
  const { isDuplicate, count } = checkDuplicate(content, senderId);

  if (isDuplicate) {
    const vc = recordViolation(senderId);
    return { isSpam: true, level: vc >= VIOLATION_THRESHOLD ? "severe" : "mild", reason: `Nội dung lặp ${count} lần`, violationCount: vc };
  }

  if (hasLink) {
    return { isSpam: true, level: "mild", reason: "Chứa liên kết", violationCount: recordViolation(senderId) };
  }

  const currentViolations = getViolationCount(senderId);
  if (currentViolations >= VIOLATION_THRESHOLD) {
    return { isSpam: false, level: "none", reason: "", violationCount: currentViolations, isRepeatOffender: true };
  }

  return { isSpam: false, level: "none", reason: "", violationCount: currentViolations };
}

function addToBlacklist(userId) { blacklist.add(userId); console.log(`[SpamDetector] User ${userId} blacklisted.`); }
function isBlacklisted(userId) { return blacklist.has(userId); }

module.exports = { detectSpam, addToBlacklist, isBlacklisted, getViolationCount };
