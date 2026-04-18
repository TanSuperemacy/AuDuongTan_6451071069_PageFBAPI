const express = require("express");
const router = express.Router();
const {
  getPageInfo, getPagePosts, createPost, deletePost,
  getPostComments, getPostLikes, getPageInsights,
} = require("../services/graphService");

// Lấy token từ header Authorization: Bearer <token>
function getToken(req) {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

router.get("/:pageId", async (req, res, next) => {
  try {
    const data = await getPageInfo(req.params.pageId, getToken(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/:pageId/posts", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await getPagePosts(req.params.pageId, limit, getToken(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post("/:pageId/posts", async (req, res, next) => {
  try {
    const { message, link } = req.body;
    if (!message) return res.status(400).json({ success: false, error: { message: "Trường 'message' là bắt buộc." } });
    const data = await createPost(req.params.pageId, message, link, getToken(req));
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete("/post/:postId", async (req, res, next) => {
  try {
    const data = await deletePost(req.params.postId, getToken(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/post/:postId/comments", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const data = await getPostComments(req.params.postId, limit, getToken(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/post/:postId/likes", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const data = await getPostLikes(req.params.postId, limit, getToken(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/:pageId/insights", async (req, res, next) => {
  try {
    const period = req.query.period || "day";
    const data = await getPageInsights(req.params.pageId, period, getToken(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
