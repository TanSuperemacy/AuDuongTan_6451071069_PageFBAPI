const axios = require("axios");
const config = require("../config");

const client = axios.create({ baseURL: config.graphBaseUrl });

function resolveToken(token) { return token || config.pageAccessToken; }

async function getPageInfo(pageId, token) {
  const { data } = await client.get(`/${pageId}`, { params: { access_token: resolveToken(token), fields: "id,name,fan_count,about,category,website,link" } });
  return data;
}

async function getPosts(pageId, limit = 10, token) {
  const { data } = await client.get(`/${pageId}/posts`, { params: { access_token: resolveToken(token), fields: "id,message,story,created_time,full_picture", limit } });
  return data;
}

async function createPost(pageId, message, link, token) {
  const params = { message, access_token: resolveToken(token) };
  if (link) params.link = link;
  const { data } = await client.post(`/${pageId}/feed`, null, { params });
  return data;
}

async function deletePost(postId, token) {
  const { data } = await client.delete(`/${postId}`, { params: { access_token: resolveToken(token) } });
  return data;
}

async function getComments(postId, limit = 20, token) {
  const { data } = await client.get(`/${postId}/comments`, { params: { access_token: resolveToken(token), fields: "id,message,from,created_time", limit } });
  return data;
}

async function getLikes(postId, limit = 20, token) {
  const { data } = await client.get(`/${postId}/likes`, { params: { access_token: resolveToken(token), limit } });
  return data;
}

async function getInsights(pageId, period = "day", token) {
  const metric = ["page_follows", "page_views_total", "page_media_view"].join(",");
  const { data } = await client.get(`/${pageId}/insights`, { params: { access_token: resolveToken(token), metric, period } });
  return data;
}

async function replyToComment(commentId, message, token) {
  const { data } = await client.post(`/${commentId}/comments`, null, { params: { message, access_token: resolveToken(token) } });
  return data;
}

async function hideComment(commentId, token) {
  const { data } = await client.post(`/${commentId}`, null, { params: { is_hidden: true, access_token: resolveToken(token) } });
  return data;
}

module.exports = { getPageInfo, getPosts, createPost, deletePost, getComments, getLikes, getInsights, replyToComment, hideComment };
