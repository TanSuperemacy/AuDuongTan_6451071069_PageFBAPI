const axios = require("axios");
const { BASE_URL, PAGE_ACCESS_TOKEN } = require("../config/graph");

const graphClient = axios.create({ baseURL: BASE_URL });

/**
 * Lấy token: ưu tiên token truyền vào, fallback về .env
 */
function resolveToken(token) {
  return token || PAGE_ACCESS_TOKEN;
}

function withToken(token, extra = {}) {
  return { access_token: resolveToken(token), ...extra };
}

async function getPageInfo(pageId, token) {
  const { data } = await graphClient.get(`/${pageId}`, {
    params: withToken(token, { fields: "id,name,fan_count,about,category,website,link" }),
  });
  return data;
}

async function getPagePosts(pageId, limit = 10, token) {
  const { data } = await graphClient.get(`/${pageId}/posts`, {
    params: withToken(token, { fields: "id,message,story,created_time,full_picture", limit }),
  });
  return data;
}

async function createPost(pageId, message, link, token) {
  const payload = { message, access_token: resolveToken(token) };
  if (link) payload.link = link;
  const { data } = await graphClient.post(`/${pageId}/feed`, null, { params: payload });
  return data;
}

async function deletePost(postId, token) {
  const { data } = await graphClient.delete(`/${postId}`, { params: withToken(token) });
  return data;
}

async function getPostComments(postId, limit = 20, token) {
  const { data } = await graphClient.get(`/${postId}/comments`, {
    params: withToken(token, { fields: "id,message,from,created_time", limit }),
  });
  return data;
}

async function getPostLikes(postId, limit = 20, token) {
  const { data } = await graphClient.get(`/${postId}/likes`, {
    params: withToken(token, { limit }),
  });
  return data;
}

async function getPageInsights(pageId, period = "day", token) {
  // Dùng metrics còn hợp lệ sau đợt deprecation Nov 2025
  const metric = [
    "page_follows",
    "page_views_total",
    "page_media_view",
  ].join(",");
  const { data } = await graphClient.get(`/${pageId}/insights`, {
    params: withToken(token, { metric, period }),
  });
  return data;
}

module.exports = { getPageInfo, getPagePosts, createPost, deletePost, getPostComments, getPostLikes, getPageInsights };
