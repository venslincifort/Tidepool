import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUES } from "@tidepool/core";
import { config } from "./config";

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const webhookQueue = new Queue(QUEUES.webhooks, { connection });
