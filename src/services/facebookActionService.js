/**
 * facebookActionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thực thi hành động tự động lên Facebook Graph API:
 *  - Ẩn bình luận (hide comment)
 *  - Block user (optional, chỉ khi tài khoản tái phạm nhiều lần)
 *
 * Xử lý lỗi:
 *  - Timeout / Rate limit → throw để coreService bắt và publish `send_failed`
 */

const axios = require("axios");
const { BASE_URL, PAGE_ACCESS_TOKEN } = require("../config/graph");

const DEFAULT_TIMEOUT_MS = 10000; // 10 giây

/**
 * Ẩn một bình luận trên Facebook Page.
 *
 * @param {string} commentId - ID của comment cần ẩn
 * @param {string} [token]   - Page Access Token (dùng default nếu không truyền)
 * @returns {Promise<object>} Kết quả từ Facebook API
 */
async function hideComment(commentId, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  console.log(`[FacebookAction] Đang ẩn comment ${commentId}...`);

  const response = await axios.post(
    `${BASE_URL}/${commentId}`,
    null,
    {
      params: {
        is_hidden: true,
        access_token: accessToken,
      },
      timeout: DEFAULT_TIMEOUT_MS,
    }
  );

  console.log(`[FacebookAction] ✅ Đã ẩn comment ${commentId}.`);
  return response.data;
}

/**
 * Hiện lại một bình luận đã bị ẩn (rollback nếu cần).
 *
 * @param {string} commentId
 * @param {string} [token]
 * @returns {Promise<object>}
 */
async function unhideComment(commentId, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  const response = await axios.post(
    `${BASE_URL}/${commentId}`,
    null,
    {
      params: {
        is_hidden: false,
        access_token: accessToken,
      },
      timeout: DEFAULT_TIMEOUT_MS,
    }
  );

  console.log(`[FacebookAction] ✅ Đã hiện lại comment ${commentId}.`);
  return response.data;
}

/**
 * Block một user khỏi Facebook Page.
 * ⚠️ Chỉ dùng khi tài khoản tái phạm rõ ràng và đã xác nhận.
 *
 * API: POST /{page-id}/blocked
 * Yêu cầu quyền: pages_manage_engagement
 *
 * @param {string} pageId  - ID của Facebook Page
 * @param {string} userId  - ID của user cần block
 * @param {string} [token] - Page Access Token
 * @returns {Promise<object>}
 */
async function blockUser(pageId, userId, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  console.log(`[FacebookAction] Đang block user ${userId} khỏi page ${pageId}...`);

  const response = await axios.post(
    `${BASE_URL}/${pageId}/blocked`,
    null,
    {
      params: {
        user: userId,
        access_token: accessToken,
      },
      timeout: DEFAULT_TIMEOUT_MS,
    }
  );

  console.log(`[FacebookAction] ✅ Đã block user ${userId}.`);
  return response.data;
}

/**
 * Gửi reply tự động vào một bình luận.
 *
 * @param {string} commentId - ID comment cần reply
 * @param {string} message   - Nội dung trả lời
 * @param {string} [token]
 * @returns {Promise<object>}
 */
async function replyToComment(commentId, message, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  console.log(`[FacebookAction] Đang reply comment ${commentId}...`);

  const response = await axios.post(
    `${BASE_URL}/${commentId}/comments`,
    null,
    {
      params: {
        message,
        access_token: accessToken,
      },
      timeout: DEFAULT_TIMEOUT_MS,
    }
  );

  console.log(`[FacebookAction] ✅ Đã reply comment ${commentId}.`);
  return response.data;
}

module.exports = { hideComment, unhideComment, blockUser, replyToComment };
