require("dotenv").config({ path: "../../../.env" });

module.exports = {
  port: process.env.BACKEND_API_PORT || 3000,
  graphBaseUrl: `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || "v19.0"}`,
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN,
  kafkaBrokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
};
