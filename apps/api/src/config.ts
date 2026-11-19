export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "whsec_local_dev_secret",
  processorUrl: process.env.PROCESSOR_URL ?? "http://localhost:4100",
  webhookUrl: process.env.WEBHOOK_URL ?? "http://localhost:4000/webhooks/processor",
};
