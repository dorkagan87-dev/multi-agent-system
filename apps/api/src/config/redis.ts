import Redis from 'ioredis';
import { config } from './index';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  lazyConnect: true,
});

export const redisSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on('error', (err) => console.error('[Redis] connection error:', err));
redisSub.on('error', (err) => console.error('[Redis sub] connection error:', err));
