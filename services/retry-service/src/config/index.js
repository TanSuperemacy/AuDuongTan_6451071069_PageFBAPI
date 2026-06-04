require("dotenv").config({ path: "../../../.env" });

module.exports = {
  kafkaBrokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  kafkaClientId: "retry-service",
  maxRetries: parseInt(process.env.RETRY_MAX_ATTEMPTS) || 5,
  baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS) || 1000,
};
