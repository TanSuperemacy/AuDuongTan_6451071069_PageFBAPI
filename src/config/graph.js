require("dotenv").config();

module.exports = {
  BASE_URL: `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || "v19.0"}`,
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
};
