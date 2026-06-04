const express = require("express");
const router = express.Router();
const graph = require("../services/graphClient");

function getToken(req) {
  const auth = req.headers["authorization"];
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

router.get("/:pageId", async (req, res, next) => {
  try { res.json({ success: true, data: await graph.getPageInfo(req.params.pageId, getToken(req)) }); } catch (e) { next(e); }
});

router.get("/:pageId/posts", async (req, res, next) => {
  try { res.json({ success: true, data: await graph.getPosts(req.params.pageId, parseInt(req.query.limit) || 10, getToken(req)) }); } catch (e) { next(e); }
});

router.post("/:pageId/posts", async (req, res, next) => {
  try {
    const { message, link } = req.body;
    if (!message) return res.status(400).json({ success: false, error: { message: "Trường 'message' là bắt buộc." } });
    res.status(201).json({ success: true, data: await graph.createPost(req.params.pageId, message, link, getToken(req)) });
  } catch (e) { next(e); }
});

router.delete("/post/:postId", async (req, res, next) => {
  try { res.json({ success: true, data: await graph.deletePost(req.params.postId, getToken(req)) }); } catch (e) { next(e); }
});

router.get("/post/:postId/comments", async (req, res, next) => {
  try { res.json({ success: true, data: await graph.getComments(req.params.postId, parseInt(req.query.limit) || 20, getToken(req)) }); } catch (e) { next(e); }
});

router.get("/post/:postId/likes", async (req, res, next) => {
  try { res.json({ success: true, data: await graph.getLikes(req.params.postId, parseInt(req.query.limit) || 20, getToken(req)) }); } catch (e) { next(e); }
});

router.get("/:pageId/insights", async (req, res, next) => {
  try { res.json({ success: true, data: await graph.getInsights(req.params.pageId, req.query.period || "day", getToken(req)) }); } catch (e) { next(e); }
});

module.exports = router;
