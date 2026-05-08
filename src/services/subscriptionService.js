/**
 * subscriptionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service đăng ký nhận sự kiện từ Facebook Webhooks.
 *
 * Tại sao cần bước này?
 *   Facebook KHÔNG tự động gửi sự kiện về server của bạn.
 *   Bạn phải "đăng ký" (subscribe) để Facebook biết rằng:
 *     "Mỗi khi có comment mới trên page này, hãy gửi POST đến webhook của tôi."
 *
 * Luồng hoạt động:
 *   1. Bạn đã verify webhook qua GET /webhook (Facebook kiểm tra server có thật)
 *   2. Gọi API này để subscribe page vào app Webhooks của bạn
 *   3. Từ đây trở đi, Facebook sẽ POST sự kiện về /webhook mỗi khi có comment/message
 *
 * Tài liệu: https://developers.facebook.com/docs/graph-api/webhooks/subscriptions-edge
 */

const axios = require("axios");
const { BASE_URL, PAGE_ACCESS_TOKEN } = require("../config/graph");

/**
 * Đăng ký (subscribe) một Facebook Page vào App Webhooks.
 *
 * Sau khi gọi hàm này, Facebook sẽ bắt đầu gửi webhook events
 * (comment, message, reactions, v.v.) về endpoint /webhook của bạn.
 *
 * @param {string} pageId   - ID của Facebook Page
 * @param {string} token    - Page Access Token (có quyền manage_pages hoặc pages_manage_metadata)
 * @returns {Promise<object>} Kết quả từ Facebook Graph API
 */
async function subscribePageToWebhook(pageId, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  const response = await axios.post(
    `${BASE_URL}/${pageId}/subscribed_apps`,
    null,
    {
      params: {
        access_token: accessToken,
        // Danh sách các "subscribed fields" — các loại sự kiện muốn nhận:
        //   feed        → comment, reaction, bài post mới trên trang
        //   messages    → tin nhắn qua Messenger
        //   message_reads, message_deliveries → trạng thái tin nhắn
        subscribed_fields: [
          "feed"        // Bình luận bài đăng (comment event)
        ].join(","),
      },
    }
  );

  return response.data;
}

/**
 * Hủy đăng ký (unsubscribe) một Facebook Page khỏi App Webhooks.
 *
 * @param {string} pageId   - ID của Facebook Page
 * @param {string} token    - Page Access Token
 * @returns {Promise<object>}
 */
async function unsubscribePageFromWebhook(pageId, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  const response = await axios.delete(
    `${BASE_URL}/${pageId}/subscribed_apps`,
    {
      params: { access_token: accessToken },
    }
  );

  return response.data;
}

/**
 * Kiểm tra trạng thái subscription hiện tại của một Page.
 *
 * @param {string} pageId   - ID của Facebook Page
 * @param {string} token    - Page Access Token
 * @returns {Promise<object>}
 */
async function getPageSubscriptionStatus(pageId, token) {
  const accessToken = token || PAGE_ACCESS_TOKEN;

  const response = await axios.get(
    `${BASE_URL}/${pageId}/subscribed_apps`,
    {
      params: { access_token: accessToken },
    }
  );

  return response.data;
}

module.exports = {
  subscribePageToWebhook,
  unsubscribePageFromWebhook,
  getPageSubscriptionStatus,
};
