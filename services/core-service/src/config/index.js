require("dotenv").config({ path: "../../../.env" });

module.exports = {
  kafkaBrokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  kafkaClientId: process.env.KAFKA_CLIENT_ID || "facebook-page-api",
  kafkaTopic: process.env.KAFKA_TOPIC || "raw_events",
  kafkaConsumerGroup: process.env.KAFKA_CONSUMER_GROUP_ID || "core-service",
};
